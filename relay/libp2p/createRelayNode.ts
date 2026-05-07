import {noise} from '@chainsafe/libp2p-noise';
import {yamux} from '@chainsafe/libp2p-yamux';
import * as circuitRelay from '@libp2p/circuit-relay-v2';
import {peerIdFromString} from '@libp2p/peer-id';
import {webRTC} from '@libp2p/webrtc';
import {webSockets} from '@libp2p/websockets';
import {createLibp2p} from 'libp2p';

import {
  coachAnalysisResultSchema,
  skeleton3dSequenceSchema,
  type CoachAnalysisResult,
  type FormSample,
} from '../../packages/protocol/schemas';
import {RelayLifecycleRecorder} from '../RelayLifecycleRecorder';
import {FORM_SAMPLE_PROTOCOL} from '../../shared/protocols';
import {
  parseFormSampleFromStream,
  writeJsonToStream,
} from '../../shared/reptileStreamCodec';
import {routeFormSampleThroughCoach} from './relayFormSampleRouting';

function getCircuitRelayTransportFactory() {
  const named = (circuitRelay as any).circuitRelayTransport;
  if (typeof named === 'function') {
    return named;
  }
  const fromDefault = (circuitRelay as any).default?.circuitRelayTransport;
  if (typeof fromDefault === 'function') {
    return fromDefault;
  }
  return null;
}

function getCircuitRelayServerFactory() {
  const named = (circuitRelay as any).circuitRelayServer;
  if (typeof named === 'function') {
    return named;
  }
  const fromDefault = (circuitRelay as any).default?.circuitRelayServer;
  if (typeof fromDefault === 'function') {
    return fromDefault;
  }
  return null;
}

function shouldEnableWebRTC(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).RTCPeerConnection === 'function';
}

function buildCoachUnavailableResult(sample: FormSample, relayNodeId: string): CoachAnalysisResult {
  return coachAnalysisResultSchema.parse({
    message_type: 'coach_analysis_result',
    message_id: `relay-error-${sample.message_id}`,
    session_id: sample.session_id,
    sender_node_id: relayNodeId,
    receiver_node_id: sample.sender_node_id,
    created_at_iso: new Date().toISOString(),
    source: 'mock',
    feedback_summary: 'No coach peer is currently connected to relay.',
    feedback_rules: [
      {
        rule_id: 'coach-unavailable',
        severity: 'critical',
        message:
          'Relay could not route this form_sample because no coach peer is available.',
      },
    ],
    skeleton_3d_sequence: skeleton3dSequenceSchema.parse({
      schema_version: '1.0.0',
      joint_schema: 'coco_17',
      coordinate_space: 'normalized_n11',
      frames: [
        {
          frame_index: 0,
          timestamp_ms: 0,
          joints: Array.from({length: 17}, (_, jointIndex) => ({
            joint_index: jointIndex,
            x: 0,
            y: 0,
            z: 0,
          })),
        },
      ],
    }),
    artifact_refs: [{kind: 'other', uri: 'relay://coach-unavailable'}],
  });
}

export async function createRelayNode(options?: {
  recorder?: RelayLifecycleRecorder;
  coachPeerId?: string;
  listenMultiaddrs?: string[];
}): Promise<import('libp2p').Libp2p> {
  const recorder = options?.recorder ?? new RelayLifecycleRecorder();
  const relayNode = await createLibp2p({
    addresses: {
      listen: options?.listenMultiaddrs ?? ['/ip4/127.0.0.1/tcp/0/ws'],
    },
    transports: [
      webSockets(),
      ...(shouldEnableWebRTC() ? [webRTC()] : []),
      ...(getCircuitRelayTransportFactory() != null
        ? [getCircuitRelayTransportFactory()!()]
        : []),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      ...(getCircuitRelayServerFactory() != null
        ? {circuitRelay: getCircuitRelayServerFactory()!()}
        : {}),
    },
  });

  const relayPeerId = relayNode.peerId.toString();
  const fixedCoachPeerId = options?.coachPeerId ?? process.env.COACH_PEER_ID;

  await relayNode.handle(FORM_SAMPLE_PROTOCOL, async ({stream, connection}) => {
    const formSample = await parseFormSampleFromStream(stream as any);

    const athletePeerId = connection.remotePeer.toString();
    const candidateCoachPeerIds = new Set<string>();
    if (fixedCoachPeerId != null && fixedCoachPeerId.trim() !== '') {
      candidateCoachPeerIds.add(fixedCoachPeerId.trim());
    }
    for (const conn of relayNode.getConnections()) {
      const candidate = conn.remotePeer.toString();
      if (candidate !== athletePeerId) {
        candidateCoachPeerIds.add(candidate);
      }
    }

    let coachResult: CoachAnalysisResult | null = null;
    let selectedCoachPeerId: string | null = null;
    if (candidateCoachPeerIds.size === 0) {
      coachResult = buildCoachUnavailableResult(formSample, relayPeerId);
      await writeJsonToStream(stream as any, coachResult);
      recorder.recordRelayForwardedToAthlete(formSample, coachResult, relayPeerId);
      return;
    }

    try {
      coachResult = await routeFormSampleThroughCoach({
        formSample,
        athleteStream: stream as any,
        relayNodeId: relayPeerId,
        recorder,
        openCoachStream: async () => {
          for (const candidate of candidateCoachPeerIds) {
            try {
              const coachStream = await relayNode.dialProtocol(
                peerIdFromString(candidate),
                FORM_SAMPLE_PROTOCOL,
              );
              selectedCoachPeerId = candidate;
              return {stream: coachStream as any, coachPeerId: candidate};
            } catch (error) {
              console.warn(
                `[relay] coach dial/response failed for ${candidate}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }
          throw new Error('No reachable coach peer');
        },
      });
    } catch (error) {
      throw new Error(
        `Relay could not get coach response from connected peers: ${[
          ...candidateCoachPeerIds,
        ].join(', ')} (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    if (selectedCoachPeerId != null && coachResult != null) {
      console.log(`[relay] forwarded via coach ${selectedCoachPeerId}`);
    }
  });

  console.log(`[relay] peer id ${relayPeerId}`);
  console.log(
    `[relay] listening on ${
      relayNode.getMultiaddrs().map(addr => addr.toString()).join(', ') || '(none)'
    }`,
  );

  return relayNode;
}
