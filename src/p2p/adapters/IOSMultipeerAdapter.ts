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

import { initSession, PeerState } from 'react-native-multipeer-connectivity';
import type { MPCSession } from 'react-native-multipeer-connectivity';
import type { EmitterSubscription } from 'react-native';
import type { P2PAdapter, Subscription } from './P2PAdapter';

// Bonjour service type: 1–15 chars, lowercase ASCII + hyphens.
// Must match NSBonjourServices in Info.plist.
const SERVICE_TYPE = 'reptile-p2p';

// MPC only supports sendText; binary payloads are base64-encoded.
const PAYLOAD_TYPE_BYTES = 1;

export class IOSMultipeerAdapter implements P2PAdapter {
  private session: MPCSession | null = null;

  // Pending invitation handlers keyed by peer id.
  private pendingInvitationHandlers: Map<
    string,
    (accept: boolean) => Promise<void>
  > = new Map();

  // Stored so requestConnection() can fire it for the inviter side.
  private connectionInitiatedCb:
    | ((endpointId: string, endpointName: string) => void)
    | null = null;

  // Listener registrations that arrived before the session was created.
  private deferredListeners: Array<(session: MPCSession) => void> = [];

  // ---- session lifecycle ----

  private _initSession(endpointName: string): MPCSession {
    if (this.session) return this.session;

    this.session = initSession({
      displayName: endpointName,
      serviceType: SERVICE_TYPE,
      discoveryInfo: { n: endpointName },
    });

    // Flush deferred listener registrations now that session exists.
    this.deferredListeners.forEach((fn) => fn(this.session!));
    this.deferredListeners = [];

    return this.session;
  }

  /**
   * Returns a Subscription whose real listener is registered immediately if
   * the session already exists, or deferred until _initSession() is called.
   */
  private _withSession(
    register: (session: MPCSession) => EmitterSubscription,
  ): Subscription {
    let inner: EmitterSubscription | null = null;
    let removed = false;

    if (this.session) {
      inner = register(this.session);
    } else {
      this.deferredListeners.push((session) => {
        if (!removed) inner = register(session);
      });
    }

    return {
      remove: () => {
        removed = true;
        inner?.remove();
      },
    };
  }

  // ---- advertising & discovery ----

  async startAdvertising(endpointName: string): Promise<void> {
    this._initSession(endpointName);
    await this.session!.advertize();
  }

  async startDiscovery(): Promise<void> {
    // Session is normally created by startAdvertising first; guard just in case.
    if (!this.session) this._initSession('0:unknown');
    await this.session!.browse();
  }

  async stopAdvertising(): Promise<void> {
    await this.session?.stopAdvertizing();
  }

  async stopDiscovery(): Promise<void> {
    await this.session?.stopBrowsing();
  }

  async stopAllEndpoints(): Promise<void> {
    await this.session?.stopAdvertizing();
    await this.session?.stopBrowsing();
    await this.session?.disconnect();
    this.session = null;
  }

  // ---- connection lifecycle ----

  async requestConnection(
    endpointName: string,
    endpointId: string,
  ): Promise<void> {
    await this.session?.invite({
      peerID: endpointId,
      timeout: 30,
      context: { n: endpointName },
    });

    // MPC does NOT fire an invitation event on the inviter side.
    // Simulate it so the engine populates pendingConnections on both devices.
    this.connectionInitiatedCb?.(endpointId, endpointName);
  }

  async acceptConnection(endpointId: string): Promise<void> {
    const handler = this.pendingInvitationHandlers.get(endpointId);
    if (handler) {
      await handler(true);
      this.pendingInvitationHandlers.delete(endpointId);
    }
    // Inviter side has no stored handler — no-op is correct.
  }

  async rejectConnection(endpointId: string): Promise<void> {
    const handler = this.pendingInvitationHandlers.get(endpointId);
    if (handler) {
      await handler(false);
      this.pendingInvitationHandlers.delete(endpointId);
    }
  }

  async disconnectFromEndpoint(_endpointId: string): Promise<void> {
    // MPC disconnects all peers together — fine for RepTile's 1-vs-1 model.
    await this.session?.disconnect();
  }

  async sendPayload(endpointId: string, bytes: Uint8Array): Promise<void> {
    // MPC library only supports UTF-8 text; encode binary as base64.
    const text = Buffer.from(bytes).toString('base64');
    await this.session?.sendText(endpointId, text);
  }

  // ---- event subscriptions ----

  onEndpointFound(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription {
    return this._withSession((session) =>
      session.onFoundPeer(({ peer, discoveryInfo }) => {
        cb(peer.id, discoveryInfo?.n ?? peer.displayName);
      }),
    );
  }

  onEndpointLost(cb: (endpointId: string) => void): Subscription {
    return this._withSession((session) =>
      session.onLostPeer(({ peer }) => cb(peer.id)),
    );
  }

  onConnectionInitiated(
    cb: (endpointId: string, endpointName: string) => void,
  ): Subscription {
    this.connectionInitiatedCb = cb;

    const sub = this._withSession((session) =>
      session.onReceivedPeerInvitation(({ peer, context, handler }) => {
        this.pendingInvitationHandlers.set(peer.id, handler);
        const name =
          (context as Record<string, string> | undefined)?.n ??
          peer.displayName;
        cb(peer.id, name);
      }),
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
    return this._withSession((session) =>
      session.onPeerStateChanged(({ peer, state }) => {
        if (state === PeerState.connected) cb(peer.id, true);
        else if (state === PeerState.notConnected) cb(peer.id, false);
      }),
    );
  }

  onDisconnected(cb: (endpointId: string) => void): Subscription {
    return this._withSession((session) =>
      session.onPeerStateChanged(({ peer, state }) => {
        if (state === PeerState.notConnected) cb(peer.id);
      }),
    );
  }

  onPayloadReceived(
    cb: (endpointId: string, payloadType: number, payload: unknown) => void,
  ): Subscription {
    return this._withSession((session) =>
      session.onReceivedText(({ peer, text }) => {
        // Decode base64 back to binary.
        const bytes = new Uint8Array(Buffer.from(text, 'base64'));
        cb(peer.id, PAYLOAD_TYPE_BYTES, bytes);
      }),
    );
  }
}
