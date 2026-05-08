import * as circuitRelay from '@libp2p/circuit-relay-v2';
import {identify} from '@libp2p/identify';
import {multiaddr} from '@multiformats/multiaddr';
import {webSockets} from '@libp2p/websockets';
import {createLibp2p} from 'libp2p';

import {createCoachPerfectRepLifter} from '../perfectrep/createCoachPerfectRepLifter.ts';
import {
  coachAnalysisResultSchema,
  formSampleSchema,
} from '../../packages/protocol/schemas.ts';
import {
  COACH_REGISTER_PROTOCOL,
  FORM_SAMPLE_PROTOCOL,
} from '../../shared/protocols.ts';
import {
  writeJsonToStream,
  parseFormSampleFromStream,
} from '../../shared/reptileStreamCodec.ts';

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

export async function createCoachNode(options?: {
  relayMultiaddr?: string;
  onFormSampleReceived?: (sample: import('../../packages/protocol/schemas.ts').FormSample) => void;
  onResultReturned?: (
    result: import('../../packages/protocol/schemas.ts').CoachAnalysisResult,
  ) => void;
}): Promise<import('libp2p').Libp2p> {
  const [{noise}, {yamux}] = await Promise.all([
    import('@chainsafe/libp2p-noise'),
    import('@chainsafe/libp2p-yamux'),
  ]);

  const node = await createLibp2p({
    transports: [
      webSockets(),
      ...(getCircuitRelayTransportFactory() != null
        ? [getCircuitRelayTransportFactory()!()]
        : []),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
    },
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/0/ws'],
    },
  });

  await node.handle(FORM_SAMPLE_PROTOCOL, async data => {
    const stream =
      (data as {stream?: unknown})?.stream != null
        ? (data as {stream: unknown}).stream
        : data;
    const sample = formSampleSchema.parse(await parseFormSampleFromStream(stream as any));
    options?.onFormSampleReceived?.(sample);
    const lifter = createCoachPerfectRepLifter();
    const lifted = await lifter.lift(sample);
    const result = coachAnalysisResultSchema.parse({
      message_type: 'coach_analysis_result',
      message_id: `coach-reply-${sample.message_id}`,
      session_id: sample.session_id,
      sender_node_id: node.peerId.toString(),
      receiver_node_id: sample.sender_node_id,
      created_at_iso: new Date().toISOString(),
      source: 'mock',
      feedback_summary: 'Coach node processed form_sample via protocol stream.',
      feedback_rules: [
        {
          rule_id: 'stream-smoke-path',
          severity: 'info',
          message: 'Request/response flow completed through relay.',
        },
      ],
      skeleton_3d_sequence: lifted.skeleton_3d_sequence,
      artifact_refs: lifted.artifact_refs,
    });
    await writeJsonToStream(stream as any, result);
    options?.onResultReturned?.(result);
  });

  const relayAddr = options?.relayMultiaddr ?? process.env.RELAY_MULTIADDR;
  if (relayAddr == null || relayAddr.trim() === '') {
    throw new Error(
      'RELAY_MULTIADDR is required for coach node startup (example: /ip4/127.0.0.1/tcp/15001/ws/p2p/<relayPeerId>)',
    );
  }
  const relayConnection = await node.dial(multiaddr(relayAddr.trim()));
  const registerStream = await relayConnection.newStream(COACH_REGISTER_PROTOCOL);
  await writeJsonToStream(registerStream as any, {
    message_type: 'coach_register',
    coach_node_id: node.peerId.toString(),
    created_at_ms: Date.now(),
  });
  console.log('[coach] registered with relay');
  console.log(`[coach] peer id ${node.peerId.toString()}`);
  console.log(`[coach] dialed relay ${relayAddr.trim()}`);

  return node;
}
