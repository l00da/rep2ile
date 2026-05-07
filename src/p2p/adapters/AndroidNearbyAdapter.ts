/**
 * AndroidNearbyAdapter — wraps react-native-google-nearby-connection.
 *
 * This is a thin, 1-to-1 mapping from the P2PAdapter interface to the
 * Google Nearby Connections API.  All strategy / service-ID details live
 * here so the engine stays platform-agnostic.
 *
 * Install: npm install react-native-google-nearby-connection
 * Permissions required in AndroidManifest.xml:
 *   BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE,
 *   BLUETOOTH_CONNECT, ACCESS_WIFI_STATE, CHANGE_WIFI_STATE,
 *   ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION
 */

import Nearby, { Strategy } from 'react-native-google-nearby-connection';
import type { P2PAdapter, Subscription } from './P2PAdapter';

// Must match on every RepTile build so devices on different platforms find each other.
const SERVICE_ID = 'com.reptile.resonance';

export class AndroidNearbyAdapter implements P2PAdapter {
  async startAdvertising(endpointName: string): Promise<void> {
    await Nearby.startAdvertising(endpointName, SERVICE_ID, Strategy.P2P_CLUSTER);
  }

  async startDiscovery(): Promise<void> {
    await Nearby.startDiscovery(SERVICE_ID, Strategy.P2P_CLUSTER);
  }

  async stopAdvertising(): Promise<void> {
    await Nearby.stopAdvertising();
  }

  async stopDiscovery(): Promise<void> {
    await Nearby.stopDiscovery();
  }

  async stopAllEndpoints(): Promise<void> {
    await Nearby.stopAllEndpoints();
  }

  async requestConnection(endpointName: string, endpointId: string): Promise<void> {
    await Nearby.requestConnection(endpointName, endpointId);
  }

  async acceptConnection(endpointId: string): Promise<void> {
    await Nearby.acceptConnection(endpointId);
  }

  async rejectConnection(endpointId: string): Promise<void> {
    await Nearby.rejectConnection(endpointId);
  }

  async disconnectFromEndpoint(endpointId: string): Promise<void> {
    await Nearby.disconnectFromEndpoint(endpointId);
  }

  async sendPayload(endpointId: string, bytes: Uint8Array): Promise<void> {
    await Nearby.sendPayload(endpointId, bytes);
  }

  onEndpointFound(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription {
    return Nearby.onEndpointFound(cb);
  }

  onEndpointLost(cb: (endpointId: string) => void): Subscription {
    return Nearby.onEndpointLost(cb);
  }

  onConnectionInitiated(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription {
    return Nearby.onConnectionInitiated(cb);
  }

  onConnectionResult(
    cb: (endpointId: string, isSuccess: boolean) => void,
  ): Subscription {
    return Nearby.onConnectionResult(cb);
  }

  onDisconnected(cb: (endpointId: string) => void): Subscription {
    return Nearby.onDisconnected(cb);
  }

  onPayloadReceived(
    cb: (endpointId: string, payloadType: number, payload: unknown) => void,
  ): Subscription {
    return Nearby.onPayloadReceived(cb);
  }
}
