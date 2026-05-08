import os from 'node:os';

import {createRelayNode} from '../relay/libp2p/createRelayNode.ts';

function discoverLanIPv4(): string | null {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return null;
}

function withLanHint(addr: string, lanIp: string | null): string {
  if (lanIp == null) {
    return addr;
  }
  return addr.replace('0.0.0.0', lanIp);
}

async function main() {
  const relayNode = await createRelayNode({
    listenMultiaddrs: ['/ip4/0.0.0.0/tcp/15001/ws'],
  });

  const multiaddrs = relayNode.getMultiaddrs().map(addr => addr.toString());
  const lanIp = discoverLanIPv4();

  console.log(`[p2p:relay] peer id: ${relayNode.peerId.toString()}`);
  console.log('[p2p:relay] multiaddrs:');
  for (const addr of multiaddrs) {
    console.log(`  - ${addr}`);
  }
  console.log('[p2p:relay] phone/laptop hint:');
  for (const addr of multiaddrs) {
    console.log(`  - ${withLanHint(addr, lanIp)}`);
  }
  console.log('[p2p:relay] ready, waiting for coach/athlete peers...');

  const shutdown = async () => {
    console.log('\n[p2p:relay] shutting down...');
    await relayNode.stop();
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
    `[p2p:relay] fatal: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
