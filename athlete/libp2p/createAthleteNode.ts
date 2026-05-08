import {multiaddr} from '@multiformats/multiaddr';
import {identify} from '@libp2p/identify';
import {webSockets} from '@libp2p/websockets';
import {createLibp2p} from 'libp2p';

import {
  coachAnalysisResultSchema,
  formSampleSchema,
  type CoachAnalysisResult,
  type FormSample,
} from '../../packages/protocol/schemas.ts';
import {FORM_SAMPLE_PROTOCOL} from '../../shared/protocols.ts';
import {
  parseCoachAnalysisResultFromStream,
  writeJsonToStream,
} from '../../shared/reptileStreamCodec.ts';

export type AthleteNodeClient = {
  node: import('libp2p').Libp2p;
  sendFormSample: (packet: FormSample) => Promise<CoachAnalysisResult>;
  stop: () => Promise<void>;
};

export async function createAthleteNode(params: {
  relayMultiaddr: string;
}): Promise<AthleteNodeClient> {
  const [{noise}, {yamux}] = await Promise.all([
    import('@chainsafe/libp2p-noise'),
    import('@chainsafe/libp2p-yamux'),
  ]);

  if (params.relayMultiaddr.trim() === '') {
    throw new Error('relayMultiaddr is required to create athlete node');
  }

  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
    },
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/0/ws'],
    },
  });

  const relayAddr = multiaddr(params.relayMultiaddr.trim());

  async function sendFormSample(packet: FormSample): Promise<CoachAnalysisResult> {
    const validatedPacket = formSampleSchema.parse(packet);
    console.log('[athlete] dialed relay');
    const connection = await node.dial(relayAddr);
    const stream = await connection.newStream(FORM_SAMPLE_PROTOCOL);
    console.log('[athlete] opened form_sample stream');
    console.log('[athlete] writing form_sample');
    await writeJsonToStream(stream as any, validatedPacket);
    console.log('[athlete] waiting for coach_analysis_result');
    const response = await parseCoachAnalysisResultFromStream(stream as any);
    console.log('[athlete] received coach_analysis_result');
    return coachAnalysisResultSchema.parse(response);
  }

  return {
    node,
    sendFormSample,
    stop: async () => {
      await node.stop();
    },
  };
}
