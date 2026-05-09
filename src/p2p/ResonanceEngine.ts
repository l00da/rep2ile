/**
 * ResonanceEngine — ambient P2P radio + arena data channel manager.
 *
 * Platform-agnostic: all radio calls go through the injected P2PAdapter.
 *   Android → AndroidNearbyAdapter  (Google Nearby Connections)
 *   iOS     → IOSMultipeerAdapter   (Apple MultipeerConnectivity)
 *
 * Layer topology:
 *   Layer 1 (ambient) — passive radar: advertise TempID, scan for peers.
 *   Layer 2 (seeking) — state escalation: stateCode '0' → '1'.
 *   Layer 3 (arena)   — encrypted data channel: handshake + rep-event stream.
 *
 * Security contract:
 *   NO CLOUD     — no byte leaves local radio range.
 *   DISC > CONN  — requestConnection() only fires from initiateChallenge().
 *   EPHEMERAL ID — TempID read from ghostIdentity at call-time, never cached.
 *   ANTI-CHEAT   — every inbound payload passes PayloadValidator.
 */

import { ghostIdentity } from '../identity/GhostIdentity';
import {
  PayloadValidator,
  RepEvent,
  CheatDetectedError,
  InvalidPayloadError,
} from './PayloadValidator';
import type { P2PAdapter } from './adapters/P2PAdapter';
import { createAdapter } from './adapters/createAdapter';

const STATE = { AMBIENT: '0', SEEKING: '1' } as const;
type StateCode = (typeof STATE)[keyof typeof STATE];

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYLOAD_TYPE_BYTES = 1;

export interface ParsedEndpoint {
  stateCode: StateCode;
  tempID: string;
}

export type EngineState = 'stopped' | 'ambient' | 'seeking';
export type PeersCallback = (peers: Set<string>) => void;
export type ArenaCallback = (arena: ReadonlyMap<string, string>) => void;
export type RepCallback = (event: RepEvent, fromEndpointId: string) => void;
export type ChallengeCallback = (
  endpointId: string,
  tempID: string,
  respond: (accept: boolean) => void,
) => void;

export class ResonanceEngine {
  private adapter: P2PAdapter;
  private validator: PayloadValidator;

  // Layer 1 / 2
  private engineState: EngineState = 'stopped';
  private peerMap: Map<string, string> = new Map();
  private onPeersChanged: PeersCallback | null = null;
  private listeners: Array<{ remove: () => void }> = [];

  // Layer 3
  private arenaMap: Map<string, string> = new Map();
  private pendingConnections: Map<string, string> = new Map();
  private onRepReceived: RepCallback | null = null;
  private onArenaChanged: ArenaCallback | null = null;
  private onChallengeReceived: ChallengeCallback | null = null;
  private arenaListeners: Array<{ remove: () => void }> = [];

  /**
   * @param adapter  Inject a custom adapter (or a mock in tests).
   *                 Defaults to the platform-appropriate adapter.
   */
  constructor(adapter?: P2PAdapter) {
    this.adapter = adapter ?? createAdapter();
    this.validator = new PayloadValidator(
      (endpointId) => this.adapter.disconnectFromEndpoint(endpointId),
    );
  }

  // -------------------------------------------------------------------------
  // Layer 1 — Ambient broadcast
  // -------------------------------------------------------------------------

  /** Start passive radar + register arena listeners for incoming challenges. */
  async startAmbientBroadcast(
    onPeersChanged?: PeersCallback,
    onRepReceived?: RepCallback,
    onArenaChanged?: ArenaCallback,
    onChallengeReceived?: ChallengeCallback,
  ): Promise<void> {
    if (!ghostIdentity.isActive()) {
      throw new Error(
        '[ResonanceEngine] No active TempID. Enter a venue first.',
      );
    }
    if (this.engineState !== 'stopped') {
      return;
    }

    this.onPeersChanged = onPeersChanged ?? null;
    this.onRepReceived = onRepReceived ?? null;
    this.onArenaChanged = onArenaChanged ?? null;
    this.onChallengeReceived = onChallengeReceived ?? null;

    this._registerListeners();
    this._registerArenaListeners();

    const endpointName = `${STATE.AMBIENT}:${ghostIdentity.getTempID()!}`;
    await this.adapter.startAdvertising(endpointName);
    await this.adapter.startDiscovery();

    this.engineState = 'ambient';
  }

  // -------------------------------------------------------------------------
  // Layer 3 — Arena channel
  // -------------------------------------------------------------------------

  /** Initiate a challenge. The only place requestConnection() is ever called. */
  async initiateChallenge(targetEndpointId: string): Promise<void> {
    if (this.engineState === 'stopped') {
      throw new Error('[ResonanceEngine] Cannot challenge: engine is not running.');
    }

    const targetTempID = this.peerMap.get(targetEndpointId);
    if (targetTempID !== undefined && this.validator.isBlacklisted(targetTempID)) {
      throw new Error(
        `[ResonanceEngine] Cannot challenge: ${targetTempID} is blacklisted.`,
      );
    }

    const endpointName = `${STATE.SEEKING}:${ghostIdentity.getTempID()!}`;
    console.log(`[Arena] initiateChallenge → target=${targetEndpointId.slice(0, 8)} myName=${endpointName}`);
    await this.adapter.stopAdvertising();
    await this.adapter.startAdvertising(endpointName);
    this.engineState = 'seeking';

    await this.adapter.requestConnection(endpointName, targetEndpointId);
  }

  /** Send a rep event to a connected arena peer. */
  async sendRepEvent(endpointId: string): Promise<void> {
    if (!this.arenaMap.has(endpointId)) {
      throw new Error(
        `[ResonanceEngine] Cannot send: ${endpointId} is not in an active Arena channel.`,
      );
    }
    const event: RepEvent = {
      type: 'event',
      action: 'rep',
      timestamp: Date.now(),
    };
    const json = JSON.stringify(event);
    console.log(`[Arena] sendRepEvent → peer=${endpointId.slice(0, 8)} payload=${json}`);
    const bytes = new TextEncoder().encode(json);
    await this.adapter.sendPayload(endpointId, bytes);
  }

  // -------------------------------------------------------------------------
  // Arena management
  // -------------------------------------------------------------------------

  /**
   * End the current arena session and return both nodes to ambient state.
   * Safe to call even if already stopped.
   */
  async endArena(): Promise<void> {
    if (this.engineState === 'stopped') return;
    console.log('[Arena] endArena — disconnecting and returning to ambient');
    await this.adapter.disconnectFromEndpoint(''); // MPC disconnects all at once
    await this._returnToAmbient();
  }

  /**
   * Re-advertise with ambient state code so we appear in nearby peers again.
   * Called after arena ends (either side) or a challenge is rejected.
   */
  private async _returnToAmbient(): Promise<void> {
    const endpointName = `${STATE.AMBIENT}:${ghostIdentity.getTempID()!}`;
    console.log(`[Arena] _returnToAmbient — re-advertising as ${endpointName}`);
    await this.adapter.stopAdvertising();
    await this.adapter.startAdvertising(endpointName);
    this.engineState = 'ambient';
  }

  // -------------------------------------------------------------------------
  // Kill Switch
  // -------------------------------------------------------------------------

  async stopAllEndpoints(): Promise<void> {
    this._unregisterListeners();
    this._unregisterArenaListeners();

    for (const endpointId of this.arenaMap.keys()) {
      this.validator.unregisterEndpoint(endpointId);
    }

    await this.adapter.stopAdvertising();
    await this.adapter.stopDiscovery();
    await this.adapter.stopAllEndpoints();

    this.peerMap.clear();
    this.arenaMap.clear();
    this.pendingConnections.clear();
    this.engineState = 'stopped';
    this.onPeersChanged?.(new Set());
    this.onArenaChanged?.(new Map());
    this.onPeersChanged = null;
    this.onRepReceived = null;
    this.onArenaChanged = null;
    this.onChallengeReceived = null;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  getNearbyTempIDs(): Set<string> {
    return new Set(this.peerMap.values());
  }

  getNearbyEndpoints(): ReadonlyMap<string, string> {
    return this.peerMap;
  }

  getArenaEndpoints(): ReadonlyMap<string, string> {
    return this.arenaMap;
  }

  getEngineState(): EngineState {
    return this.engineState;
  }

  getConnectedPeerCount(): number {
    return this.arenaMap.size;
  }

  parseEndpointName(raw: string): ParsedEndpoint | null {
    const sep = raw.indexOf(':');
    if (sep === -1) return null;
    const stateCode = raw.slice(0, sep);
    const tempID = raw.slice(sep + 1);
    if (stateCode !== STATE.AMBIENT && stateCode !== STATE.SEEKING) return null;
    if (!UUID_V4_RE.test(tempID)) return null;
    return { stateCode: stateCode as StateCode, tempID };
  }

  // -------------------------------------------------------------------------
  // Private — listener management
  // -------------------------------------------------------------------------

  private _push(
    target: Array<{ remove: () => void }>,
    sub: unknown,
  ): void {
    if (sub && typeof (sub as { remove?: () => void }).remove === 'function') {
      target.push(sub as { remove: () => void });
    }
  }

  private _registerListeners(): void {
    this._push(
      this.listeners,
      this.adapter.onEndpointFound((endpointId, endpointName) => {
        const parsed = this.parseEndpointName(endpointName);
        if (parsed === null) return;
        this.peerMap.set(endpointId, parsed.tempID);
        this.onPeersChanged?.(this.getNearbyTempIDs());
      }),
    );

    this._push(
      this.listeners,
      this.adapter.onEndpointLost((endpointId) => {
        this.peerMap.delete(endpointId);
        this.onPeersChanged?.(this.getNearbyTempIDs());
      }),
    );
  }

  private _unregisterListeners(): void {
    this.listeners.forEach((s) => s.remove());
    this.listeners = [];
  }

  private _registerArenaListeners(): void {
    this._push(
      this.arenaListeners,
      this.adapter.onConnectionInitiated((endpointId, endpointName) => {
        void this._handleConnectionInitiated(endpointId, endpointName);
      }),
    );

    this._push(
      this.arenaListeners,
      this.adapter.onConnectionResult((endpointId, isSuccess) => {
        this._handleConnectionResult(endpointId, isSuccess);
      }),
    );

    this._push(
      this.arenaListeners,
      this.adapter.onDisconnected((endpointId) => {
        this._handleDisconnected(endpointId);
      }),
    );

    this._push(
      this.arenaListeners,
      this.adapter.onPayloadReceived((endpointId, payloadType, payload) => {
        void this._handlePayload(endpointId, payloadType, payload);
      }),
    );
  }

  private _unregisterArenaListeners(): void {
    this.arenaListeners.forEach((s) => s.remove());
    this.arenaListeners = [];
  }

  // -------------------------------------------------------------------------
  // Private — event handlers
  // -------------------------------------------------------------------------

  private async _handleConnectionInitiated(
    endpointId: string,
    endpointName: string,
  ): Promise<void> {
    const parsed = this.parseEndpointName(endpointName);
    if (parsed === null) {
      console.log(`[Arena] connectionInitiated REJECTED — invalid name="${endpointName}" peer=${endpointId.slice(0, 8)}`);
      await this.adapter.rejectConnection(endpointId);
      return;
    }
    if (this.validator.isBlacklisted(parsed.tempID)) {
      console.log(`[Arena] connectionInitiated REJECTED — blacklisted tempID=${parsed.tempID.slice(0, 8)} peer=${endpointId.slice(0, 8)}`);
      await this.adapter.rejectConnection(endpointId);
      return;
    }
    if (this.arenaMap.size >= 1) {
      console.log(`[Arena] connectionInitiated REJECTED — arena full (size=${this.arenaMap.size}) peer=${endpointId.slice(0, 8)}`);
      await this.adapter.rejectConnection(endpointId);
      return;
    }

    // On the inviter side, connectionInitiated is simulated by the adapter
    // (no consent callback needed — inviter chose to challenge).
    if (this.engineState === 'seeking') {
      console.log(`[Arena] connectionInitiated AUTO-ACCEPTED (inviter) — peer=${endpointId.slice(0, 8)} tempID=${parsed.tempID.slice(0, 8)}`);
      this.pendingConnections.set(endpointId, parsed.tempID);
      await this.adapter.acceptConnection(endpointId);
      return;
    }

    // Invitee side — ask for consent.
    if (this.onChallengeReceived) {
      console.log(`[Arena] connectionInitiated — asking consent for peer=${endpointId.slice(0, 8)} tempID=${parsed.tempID.slice(0, 8)}`);
      this.onChallengeReceived(endpointId, parsed.tempID, async (accept) => {
        if (accept) {
          console.log(`[Arena] consent ACCEPTED — peer=${endpointId.slice(0, 8)}`);
          this.pendingConnections.set(endpointId, parsed.tempID);
          await this.adapter.acceptConnection(endpointId);
        } else {
          console.log(`[Arena] consent REJECTED — peer=${endpointId.slice(0, 8)}`);
          await this.adapter.rejectConnection(endpointId);
        }
      });
    } else {
      // No consent callback registered — auto-accept.
      console.log(`[Arena] connectionInitiated AUTO-ACCEPTED (no cb) — peer=${endpointId.slice(0, 8)} tempID=${parsed.tempID.slice(0, 8)}`);
      this.pendingConnections.set(endpointId, parsed.tempID);
      await this.adapter.acceptConnection(endpointId);
    }
  }

  private _handleConnectionResult(endpointId: string, isSuccess: boolean): void {
    const tempID = this.pendingConnections.get(endpointId);
    this.pendingConnections.delete(endpointId);
    if (!isSuccess || tempID === undefined) {
      console.log(`[Arena] connectionResult FAILED — peer=${endpointId.slice(0, 8)} isSuccess=${isSuccess} hadPending=${tempID !== undefined}`);
      // If we were the challenger and got rejected, return to ambient.
      if (this.engineState === 'seeking') {
        console.log('[Arena] challenge rejected — returning to ambient');
        void this._returnToAmbient();
      }
      return;
    }
    this.arenaMap.set(endpointId, tempID);
    this.validator.registerEndpoint(endpointId, tempID);
    console.log(`[Arena] connectionResult SUCCESS — peer=${endpointId.slice(0, 8)} tempID=${tempID.slice(0, 8)} arenaSize=${this.arenaMap.size}`);
    this.onArenaChanged?.(this.arenaMap);
  }

  private _handleDisconnected(endpointId: string): void {
    const tempID = this.arenaMap.get(endpointId);
    this.arenaMap.delete(endpointId);
    this.validator.unregisterEndpoint(endpointId);
    console.log(`[Arena] disconnected — peer=${endpointId.slice(0, 8)} tempID=${tempID?.slice(0, 8) ?? 'unknown'} arenaSize=${this.arenaMap.size}`);
    this.onArenaChanged?.(this.arenaMap);
    // If the arena is now empty and the engine is still running, return to ambient.
    if (this.arenaMap.size === 0 && this.engineState !== 'stopped') {
      console.log('[Arena] arena empty — returning to ambient');
      void this._returnToAmbient();
    }
  }

  private async _handlePayload(
    endpointId: string,
    payloadType: number,
    payload: unknown,
  ): Promise<void> {
    if (payloadType !== PAYLOAD_TYPE_BYTES) {
      console.log(`[Arena] _handlePayload IGNORED — wrong payloadType=${payloadType}`);
      return;
    }
    if (!(payload instanceof Uint8Array)) {
      console.log(`[Arena] _handlePayload IGNORED — payload is not Uint8Array (got ${typeof payload})`);
      return;
    }
    console.log(`[Arena] _handlePayload received ${payload.byteLength} bytes from peer=${endpointId.slice(0, 8)}`);
    try {
      const event = await this.validator.validate(endpointId, payload);
      console.log(`[Arena] validate PASSED — action=${event.action} ts=${event.timestamp} from peer=${endpointId.slice(0, 8)}`);
      this.onRepReceived?.(event, endpointId);
    } catch (err) {
      if (err instanceof CheatDetectedError) {
        console.warn(`[Arena] validate BANNED (cheat) — peer=${endpointId.slice(0, 8)}: ${err.message}`);
      } else if (err instanceof InvalidPayloadError) {
        console.warn(`[Arena] validate BANNED (invalid) — peer=${endpointId.slice(0, 8)}: ${err.message}`);
      } else {
        throw err;
      }
    }
  }
}

export const resonanceEngine = new ResonanceEngine();
