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
    const bytes = new TextEncoder().encode(JSON.stringify(event));
    await this.adapter.sendPayload(endpointId, bytes);
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
    if (parsed === null || this.validator.isBlacklisted(parsed.tempID)) {
      await this.adapter.rejectConnection(endpointId);
      return;
    }
    this.pendingConnections.set(endpointId, parsed.tempID);
    await this.adapter.acceptConnection(endpointId);
  }

  private _handleConnectionResult(endpointId: string, isSuccess: boolean): void {
    const tempID = this.pendingConnections.get(endpointId);
    this.pendingConnections.delete(endpointId);
    if (!isSuccess || tempID === undefined) return;
    this.arenaMap.set(endpointId, tempID);
    this.validator.registerEndpoint(endpointId, tempID);
    this.onArenaChanged?.(this.arenaMap);
  }

  private _handleDisconnected(endpointId: string): void {
    this.arenaMap.delete(endpointId);
    this.validator.unregisterEndpoint(endpointId);
    this.onArenaChanged?.(this.arenaMap);
  }

  private async _handlePayload(
    endpointId: string,
    payloadType: number,
    payload: unknown,
  ): Promise<void> {
    if (payloadType !== PAYLOAD_TYPE_BYTES) return;
    if (!(payload instanceof Uint8Array)) return;
    try {
      const event = await this.validator.validate(endpointId, payload);
      this.onRepReceived?.(event, endpointId);
    } catch (err) {
      if (
        !(err instanceof CheatDetectedError) &&
        !(err instanceof InvalidPayloadError)
      ) {
        throw err;
      }
    }
  }
}

export const resonanceEngine = new ResonanceEngine();
