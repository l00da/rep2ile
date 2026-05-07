/**
 * NoOpAdapter — silent stub used when no native P2P module is available
 * (Android emulator, unsupported platform, CI).
 * Every method resolves immediately; subscriptions return a no-op remove().
 */

import type { P2PAdapter, Subscription } from './P2PAdapter';

const sub = (): Subscription => ({ remove: () => {} });

export class NoOpAdapter implements P2PAdapter {
  private readonly warn = (m: string) =>
    console.warn(`[NoOpAdapter] ${m} — no native P2P module available.`);

  startAdvertising(name: string) { this.warn(`startAdvertising(${name})`); return Promise.resolve(); }
  startDiscovery()               { this.warn('startDiscovery');               return Promise.resolve(); }
  stopAdvertising()              { return Promise.resolve(); }
  stopDiscovery()                { return Promise.resolve(); }
  stopAllEndpoints()             { return Promise.resolve(); }
  requestConnection(n: string, id: string) { this.warn(`requestConnection(${n},${id})`); return Promise.resolve(); }
  acceptConnection(_id: string)  { return Promise.resolve(); }
  rejectConnection(_id: string)  { return Promise.resolve(); }
  disconnectFromEndpoint(_id: string) { return Promise.resolve(); }
  sendPayload(_id: string, _b: Uint8Array) { this.warn('sendPayload'); return Promise.resolve(); }

  onEndpointFound()       { return sub(); }
  onEndpointLost()        { return sub(); }
  onConnectionInitiated() { return sub(); }
  onConnectionResult()    { return sub(); }
  onDisconnected()        { return sub(); }
  onPayloadReceived()     { return sub(); }
}
