/**
 * IOSMultipeerAdapter — wraps react-native-multipeer-connectivity.
 *
 * Maps Apple MultipeerConnectivity (MPC) onto the P2PAdapter interface.
 * MPC is the iOS counterpart to Google Nearby Connections: it uses BLE
 * for peer discovery and Wi-Fi Direct / infrastructure Wi-Fi for data.
 *
 * Install: npm install react-native-multipeer-connectivity
 *          cd ios && pod install
 *
 * Required Info.plist keys:
 *   NSLocalNetworkUsageDescription  (local network access dialog)
 *   NSBonjourServices               ["_reptile-p2p._tcp"]
 *   NSBluetoothAlwaysUsageDescription
 *
 * Xcode Capabilities:
 *   Background Modes → Uses Bluetooth LE accessories
 *
 * --- Protocol mapping ---
 *
 * | Nearby Connections          | MultipeerConnectivity             |
 * |-----------------------------|-----------------------------------|
 * | endpointName                | discoveryInfo["n"] / invite ctx   |
 * | endpointId                  | MCPeerID (as string)              |
 * | startAdvertising()          | Multipeer.advertise()             |
 * | startDiscovery()            | Multipeer.browse()                |
 * | requestConnection()         | Multipeer.invite() + simulated    |
 * |                             |   onConnectionInitiated for self  |
 * | acceptConnection()          | stored accept() callback          |
 * | rejectConnection()          | stored decline() callback         |
 * | onEndpointFound             | 'peer.found' event                |
 * | onEndpointLost              | 'peer.lost' event                 |
 * | onConnectionInitiated       | 'invite' event  (invitee side)    |
 * |                             |   + simulated    (inviter side)   |
 * | onConnectionResult(true)    | 'peer.connected' event            |
 * | onConnectionResult(false)   | 'peer.disconnected' (if pending)  |
 * | onDisconnected              | 'peer.disconnected' event         |
 * | sendPayload(bytes)          | Multipeer.send([peer], Buffer)    |
 * | onPayloadReceived           | 'data' event                      |
 *
 * Asymmetry note:
 *   Nearby fires onConnectionInitiated on BOTH sides of a handshake.
 *   MPC only fires 'invite' on the INVITEE side.  To keep the engine
 *   interface symmetric, requestConnection() fires the registered
 *   onConnectionInitiated callback immediately for the inviter so the
 *   engine can populate pendingConnections on both devices.  The
 *   acceptConnection() call from the inviter side is then a no-op.
 */

import Multipeer from 'react-native-multipeer-connectivity';
import type { P2PAdapter, Subscription } from './P2PAdapter';

// Bonjour service type: 1–15 chars, lowercase ASCII + hyphens.
// Must match NSBonjourServices in Info.plist.
const SERVICE_TYPE = 'reptile-p2p';

// Payload type constant — MPC only sends raw bytes, always treated as BYTES=1.
const PAYLOAD_TYPE_BYTES = 1;

export class IOSMultipeerAdapter implements P2PAdapter {
  // Stored accept/decline callbacks from incoming MPC invitations.
  private pendingAccept: Map<string, () => void> = new Map();
  private pendingDecline: Map<string, () => void> = new Map();

  // The single onConnectionInitiated callback registered by the engine.
  // Kept here so requestConnection() can fire it for the inviter side.
  private connectionInitiatedCb:
    | ((endpointId: string, endpointName: string) => void)
    | null = null;

  // ---- advertising & discovery ----

  async startAdvertising(endpointName: string): Promise<void> {
    Multipeer.advertise({ serviceType: SERVICE_TYPE, discoveryInfo: { n: endpointName } });
  }

  async startDiscovery(): Promise<void> {
    Multipeer.browse({ serviceType: SERVICE_TYPE });
  }

  async stopAdvertising(): Promise<void> {
    Multipeer.stopAdvertising();
  }

  async stopDiscovery(): Promise<void> {
    Multipeer.stopBrowsing();
  }

  async stopAllEndpoints(): Promise<void> {
    Multipeer.stopAdvertising();
    Multipeer.stopBrowsing();
    Multipeer.disconnect();
  }

  // ---- connection lifecycle ----

  async requestConnection(endpointName: string, endpointId: string): Promise<void> {
    // Send the MPC invitation with our endpointName as context so the invitee
    // can read it in the 'invite' handler.
    Multipeer.invite({ id: endpointId }, endpointName, 30 /* timeout seconds */);

    // MPC does NOT fire an 'invite' event on the inviter.  Simulate it so
    // the engine's _handleConnectionInitiated runs on our side too, populating
    // pendingConnections and calling acceptConnection() (which is a no-op below).
    this.connectionInitiatedCb?.(endpointId, endpointName);
  }

  async acceptConnection(endpointId: string): Promise<void> {
    const accept = this.pendingAccept.get(endpointId);
    if (accept) {
      accept();
      this.pendingAccept.delete(endpointId);
      this.pendingDecline.delete(endpointId);
    }
    // If there is no stored accept callback we are the inviter — no-op is correct.
  }

  async rejectConnection(endpointId: string): Promise<void> {
    const decline = this.pendingDecline.get(endpointId);
    if (decline) {
      decline();
      this.pendingAccept.delete(endpointId);
      this.pendingDecline.delete(endpointId);
    }
  }

  async disconnectFromEndpoint(_endpointId: string): Promise<void> {
    // MPC disconnects all peers together.  Fine for RepTile's 1-vs-1 model.
    Multipeer.disconnect();
  }

  async sendPayload(endpointId: string, bytes: Uint8Array): Promise<void> {
    // react-native-multipeer-connectivity accepts Buffer or Uint8Array.
    Multipeer.send([{ id: endpointId }], Buffer.from(bytes), true /* reliable */);
  }

  // ---- event subscriptions ----

  onEndpointFound(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription {
    // discoveryInfo["n"] carries the endpointName micro-payload.
    return Multipeer.addListener(
      'peer.found',
      (peer: { id: string }, info: Record<string, string>) => {
        cb(peer.id, info?.n ?? '');
      },
    );
  }

  onEndpointLost(cb: (endpointId: string) => void): Subscription {
    return Multipeer.addListener('peer.lost', (peer: { id: string }) => {
      cb(peer.id);
    });
  }

  onConnectionInitiated(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription {
    // Store the callback so requestConnection() can fire it for the inviter.
    this.connectionInitiatedCb = cb;

    const sub = Multipeer.addListener(
      'invite',
      (
        peer: { id: string },
        context: string,
        accept: () => void,
        decline: () => void,
      ) => {
        // Store accept/decline for when the engine calls acceptConnection / rejectConnection.
        this.pendingAccept.set(peer.id, accept);
        this.pendingDecline.set(peer.id, decline);
        // context is the inviter's endpointName ("1:uuid").
        cb(peer.id, context ?? '');
      },
    );

    return {
      remove: () => {
        sub.remove();
        this.connectionInitiatedCb = null;
      },
    };
  }

  onConnectionResult(
    cb: (endpointId: string, isSuccess: boolean) => void,
  ): Subscription {
    // 'peer.connected'    → handshake succeeded
    // 'peer.disconnected' → handshake failed or peer dropped (engine handles both)
    const connSub = Multipeer.addListener(
      'peer.connected',
      (peer: { id: string }) => cb(peer.id, true),
    );
    const failSub = Multipeer.addListener(
      'peer.disconnected',
      (peer: { id: string }) => cb(peer.id, false),
    );

    // Return a combined subscription.
    return {
      remove: () => {
        connSub.remove();
        failSub.remove();
      },
    };
  }

  onDisconnected(cb: (endpointId: string) => void): Subscription {
    return Multipeer.addListener(
      'peer.disconnected',
      (peer: { id: string }) => cb(peer.id),
    );
  }

  onPayloadReceived(
    cb: (endpointId: string, payloadType: number, payload: unknown) => void,
  ): Subscription {
    return Multipeer.addListener(
      'data',
      (peer: { id: string }, data: Buffer) => {
        cb(peer.id, PAYLOAD_TYPE_BYTES, new Uint8Array(data));
      },
    );
  }
}
