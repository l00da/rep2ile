import * as circuitRelay from '@libp2p/circuit-relay-v2';
import {identify} from '@libp2p/identify';
import {peerIdFromString} from '@libp2p/peer-id';
import {webRTC} from '@libp2p/webrtc';
import {webSockets} from '@libp2p/websockets';
import {createLibp2p} from 'libp2p';

import {
  formSampleSchema,
} from '../../packages/protocol/schemas.ts';
import {RelayLifecycleRecorder} from '../RelayLifecycleRecorder.ts';
import {
  COACH_REGISTER_PROTOCOL,
  FORM_SAMPLE_PROTOCOL,
} from '../../shared/protocols.ts';
import {
  readJsonFromStream,
  parseFormSampleFromStream,
} from '../../shared/reptileStreamCodec.ts';
import {routeFormSampleThroughCoach} from './relayFormSampleRouting.ts';
import {RelayCoachRegistry} from './RelayCoachRegistry.ts';
import {respondNoCoachAvailable} from './noCoachResponse.ts';

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

function normalizeIncomingStreamData(
  data: unknown,
): {stream: unknown; connection: any | null} {
  const record = data as {stream?: unknown; connection?: any};
  if (record?.stream != null) {
    return {stream: record.stream, connection: record.connection ?? null};
  }
  return {stream: data, connection: record?.connection ?? null};
}

export async function createRelayNode(options?: {
  recorder?: RelayLifecycleRecorder;
  coachPeerId?: string;
  listenMultiaddrs?: string[];
}): Promise<import('libp2p').Libp2p> {
  const [{noise}, {yamux}] = await Promise.all([
    import('@chainsafe/libp2p-noise'),
    import('@chainsafe/libp2p-yamux'),
  ]);

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
      identify: identify(),
      ...(getCircuitRelayServerFactory() != null
        ? {circuitRelay: getCircuitRelayServerFactory()!()}
        : {}),
    },
  });

  const relayPeerId = relayNode.peerId.toString();
  const fixedCoachPeerId = options?.coachPeerId ?? process.env.COACH_PEER_ID;
  const coachRegistry = new RelayCoachRegistry();

  await relayNode.handle(COACH_REGISTER_PROTOCOL, async data => {
    const {stream, connection} = normalizeIncomingStreamData(data);
    try {
      const payload = (await readJsonFromStream(stream as any)) as {
        message_type?: string;
        coach_node_id?: string;
        created_at_ms?: number;
      };
      if (payload.message_type !== 'coach_register') {
        throw new Error(`Invalid coach register payload type: ${payload.message_type}`);
      }

      const coachPeerId =
        connection?.remotePeer?.toString() ??
        (typeof payload.coach_node_id === 'string' ? payload.coach_node_id : null);
      if (coachPeerId == null || coachPeerId.trim() === '') {
        throw new Error('Incoming coach register stream did not include a coach peer id');
      }
      coachRegistry.register({
        coachPeerId,
        coachMultiaddrs:
          connection?.remoteAddr != null ? [connection.remoteAddr.toString()] : [],
        registeredAtMs:
          typeof payload.created_at_ms === 'number'
            ? payload.created_at_ms
            : Date.now(),
      });
      console.log(`[relay] coach registered ${coachPeerId}`);
    } catch (error) {
      console.error(
        `[relay] coach registration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  });

  await relayNode.handle(FORM_SAMPLE_PROTOCOL, async data => {
    const {stream, connection} = normalizeIncomingStreamData(data);
    const formSample = formSampleSchema.parse(
      await parseFormSampleFromStream(stream as any),
    );

    const athletePeerId = connection?.remotePeer?.toString() ?? null;
    const candidateCoachPeerIds = new Set<string>();
    const registeredCoachPeerId = coachRegistry.getCurrentCoachPeerId();
    if (registeredCoachPeerId != null && registeredCoachPeerId !== athletePeerId) {
      candidateCoachPeerIds.add(registeredCoachPeerId);
    }
    if (fixedCoachPeerId != null && fixedCoachPeerId.trim() !== '') {
      candidateCoachPeerIds.add(fixedCoachPeerId.trim());
    }
    for (const conn of relayNode.getConnections()) {
      const candidate = conn.remotePeer.toString();
      if (athletePeerId == null || candidate !== athletePeerId) {
        candidateCoachPeerIds.add(candidate);
      }
    }

    let selectedCoachPeerId: string | null = null;
    if (candidateCoachPeerIds.size === 0) {
      await respondNoCoachAvailable({
        athleteStream: stream as any,
        sample: formSample,
        relayNodeId: relayPeerId,
        recorder,
      });
      return;
    }

    try {
      await routeFormSampleThroughCoach({
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

    if (selectedCoachPeerId != null) {
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
