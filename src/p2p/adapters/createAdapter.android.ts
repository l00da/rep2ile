import type { P2PAdapter } from './P2PAdapter';

export function createAdapter(): P2PAdapter {
  try {
    const Nearby = require('react-native-google-nearby-connection').default;
    // Native module is absent on emulator / when not linked.
    if (!Nearby || !Nearby.startAdvertising) throw new Error('module absent');
    const { AndroidNearbyAdapter } = require('./AndroidNearbyAdapter');
    return new AndroidNearbyAdapter();
  } catch {
    const { NoOpAdapter } = require('./NoOpAdapter');
    return new NoOpAdapter();
  }
}
