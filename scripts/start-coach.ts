import {createCoachNode} from '../coach-node/libp2p/createCoachNode.ts';

async function main() {
  const relayMultiaddr = process.env.RELAY_MULTIADDR?.trim();
  if (relayMultiaddr == null || relayMultiaddr === '') {
    throw new Error(
      'RELAY_MULTIADDR is required. Example: RELAY_MULTIADDR=/ip4/127.0.0.1/tcp/15001/ws/p2p/<relayPeerId>',
    );
  }

  const coachNode = await createCoachNode({
    relayMultiaddr,
    onFormSampleReceived: sample => {
      console.log(
        `[p2p:coach] received form_sample message_id=${sample.message_id} session_id=${sample.session_id} from=${sample.sender_node_id}`,
      );
    },
    onResultReturned: result => {
      console.log(
        `[p2p:coach] returned coach_analysis_result message_id=${result.message_id} source=${result.source} frames=${result.skeleton_3d_sequence.frames.length}`,
      );
    },
  });

  console.log(`[p2p:coach] peer id: ${coachNode.peerId.toString()}`);
  console.log(`[p2p:coach] connected relay: ${relayMultiaddr}`);
  console.log('[p2p:coach] ready, waiting for form_sample streams...');

  const shutdown = async () => {
    console.log('\n[p2p:coach] shutting down...');
    await coachNode.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  await new Promise<void>(() => {
    // keep process alive until signal
  });
}

main().catch(error => {
  console.error(
    `[p2p:coach] fatal: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
