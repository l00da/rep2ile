/**
 * AndroidNearbyAdapter — verifies the mapping from P2PAdapter interface
 * to react-native-google-nearby-connection method calls.
 */

jest.mock(
  'react-native-google-nearby-connection',
  () => {
    const sub = () => ({ remove: jest.fn() });
    return {
      __esModule: true,
      default: {
        startAdvertising: jest.fn().mockResolvedValue(undefined),
        startDiscovery: jest.fn().mockResolvedValue(undefined),
        stopAdvertising: jest.fn().mockResolvedValue(undefined),
        stopDiscovery: jest.fn().mockResolvedValue(undefined),
        stopAllEndpoints: jest.fn().mockResolvedValue(undefined),
        requestConnection: jest.fn().mockResolvedValue(undefined),
        acceptConnection: jest.fn().mockResolvedValue(undefined),
        rejectConnection: jest.fn().mockResolvedValue(undefined),
        disconnectFromEndpoint: jest.fn().mockResolvedValue(undefined),
        sendPayload: jest.fn().mockResolvedValue(undefined),
        onEndpointFound: jest.fn().mockImplementation(sub),
        onEndpointLost: jest.fn().mockImplementation(sub),
        onConnectionInitiated: jest.fn().mockImplementation(sub),
        onConnectionResult: jest.fn().mockImplementation(sub),
        onDisconnected: jest.fn().mockImplementation(sub),
        onPayloadReceived: jest.fn().mockImplementation(sub),
      },
      Strategy: { P2P_CLUSTER: 'P2P_CLUSTER' },
    };
  },
  { virtual: true },
);

import Nearby from 'react-native-google-nearby-connection';
import { AndroidNearbyAdapter } from '../../../src/p2p/adapters/AndroidNearbyAdapter';

describe('AndroidNearbyAdapter', () => {
  let adapter: AndroidNearbyAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AndroidNearbyAdapter();
  });

  it('startAdvertising passes endpointName + SERVICE_ID + P2P_CLUSTER', async () => {
    await adapter.startAdvertising('0:some-uuid');
    expect(Nearby.startAdvertising).toHaveBeenCalledWith(
      '0:some-uuid',
      'com.reptile.resonance',
      'P2P_CLUSTER',
    );
  });

  it('startDiscovery passes SERVICE_ID + P2P_CLUSTER', async () => {
    await adapter.startDiscovery();
    expect(Nearby.startDiscovery).toHaveBeenCalledWith(
      'com.reptile.resonance',
      'P2P_CLUSTER',
    );
  });

  it('stopAdvertising delegates to Nearby', async () => {
    await adapter.stopAdvertising();
    expect(Nearby.stopAdvertising).toHaveBeenCalledTimes(1);
  });

  it('stopDiscovery delegates to Nearby', async () => {
    await adapter.stopDiscovery();
    expect(Nearby.stopDiscovery).toHaveBeenCalledTimes(1);
  });

  it('requestConnection passes both arguments', async () => {
    await adapter.requestConnection('1:my-uuid', 'ep_target');
    expect(Nearby.requestConnection).toHaveBeenCalledWith('1:my-uuid', 'ep_target');
  });

  it('sendPayload passes endpointId and bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await adapter.sendPayload('ep1', bytes);
    expect(Nearby.sendPayload).toHaveBeenCalledWith('ep1', bytes);
  });

  it('onEndpointFound returns a subscription with remove()', () => {
    const sub = adapter.onEndpointFound(jest.fn());
    expect(typeof sub.remove).toBe('function');
  });

  it('forwards the onEndpointFound callback to Nearby', () => {
    const cb = jest.fn();
    adapter.onEndpointFound(cb);
    expect(Nearby.onEndpointFound).toHaveBeenCalledWith(cb);
  });
});
