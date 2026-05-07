import {noise} from '@chainsafe/libp2p-noise';
import {yamux} from '@chainsafe/libp2p-yamux';
import {multiaddr} from '@multiformats/multiaddr';
import {webSockets} from '@libp2p/websockets';
import {createLibp2p} from 'libp2p';

import {
  coachAnalysisResultSchema,
  formSampleSchema,
  type CoachAnalysisResult,
  type FormSample,
} from '../../packages/protocol/schemas';
import {FORM_SAMPLE_PROTOCOL} from '../../shared/protocols';
import {
  parseCoachAnalysisResultFromStream,
  writeJsonToStream,
} from '../../shared/reptileStreamCodec';

export type AthleteNodeClient = {
  node: import('libp2p').Libp2p;
  sendFormSample: (packet: FormSample) => Promise<CoachAnalysisResult>;
  stop: () => Promise<void>;
};

export async function createAthleteNode(params: {
  relayMultiaddr: string;
}): Promise<AthleteNodeClient> {
  if (params.relayMultiaddr.trim() === '') {
    throw new Error('relayMultiaddr is required to create athlete node');
  }

  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/0/ws'],
    },
  });

  const relayAddr = multiaddr(params.relayMultiaddr.trim());

  async function sendFormSample(packet: FormSample): Promise<CoachAnalysisResult> {
    const validatedPacket = formSampleSchema.parse(packet);
    await node.dial(relayAddr);
    const stream = await node.dialProtocol(relayAddr, FORM_SAMPLE_PROTOCOL);
    await writeJsonToStream(stream as any, validatedPacket);
    const response = await parseCoachAnalysisResultFromStream(stream as any);
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
