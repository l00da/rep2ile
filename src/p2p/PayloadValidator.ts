/**
 * PayloadValidator — Layer 3 (Arena) inbound payload firewall.
 *
 * Every byte received from a peer in a connected Arena channel passes through
 * this pipeline before the application layer ever sees it.
 *
 * Security contract:
 *  - Schema gate: only `{ type:"event", action:"rep", timestamp:number }` is
 *    accepted. Extra fields, wrong types, or missing keys → ban.
 *  - Physics gate: ≥ 5 rep events arriving within any 1-second sliding window
 *    is biologically impossible → cheat flag → ban.
 *  - On any violation: disconnect the peer immediately, blacklist their TempID
 *    for the rest of the session (survives reconnects), then throw.
 *
 * Banning sequence (order is intentional):
 *   1. Add TempID to blacklist (identity-level, survives endpoint churn).
 *   2. Call disconnectFn (severs the Nearby channel).
 *   3. Throw the violation error to the caller.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RepEvent {
  type: 'event';
  action: 'rep';
  timestamp: number;
}

export class InvalidPayloadError extends Error {
  constructor(
    public readonly endpointId: string,
    public readonly reason: string,
  ) {
    super(`[PayloadValidator] Bad payload from ${endpointId}: ${reason}`);
    this.name = 'InvalidPayloadError';
  }
}

export class CheatDetectedError extends Error {
  constructor(public readonly endpointId: string) {
    super(`[PayloadValidator] Cheat detected from ${endpointId}: physics limit exceeded`);
    this.name = 'CheatDetectedError';
  }
}

export type DisconnectFn = (endpointId: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// 5 or more rep events within 1 second is biologically impossible (arch spec §6).
// We track up to 4 timestamps; if the 5th arrives inside the window → ban.
const MAX_REPS_IN_WINDOW = 4;
const RATE_WINDOW_MS = 1000;

// ---------------------------------------------------------------------------
// Private schema guard
// ---------------------------------------------------------------------------

/**
 * Strict type guard — rejects if ANY of:
 *   - not a plain object
 *   - extra keys beyond the three required ones
 *   - wrong literal values for type / action
 *   - timestamp is not a finite number
 */
function isRepEvent(v: unknown): v is RepEvent {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    Object.keys(o).length === 3 &&
    o.type === 'event' &&
    o.action === 'rep' &&
    typeof o.timestamp === 'number' &&
    Number.isFinite(o.timestamp)
  );
}

// ---------------------------------------------------------------------------
// PayloadValidator class
// ---------------------------------------------------------------------------

export class PayloadValidator {
  // endpointId → sorted list of recent (receive-time) timestamps.
  private rateWindows: Map<string, number[]> = new Map();

  // TempIDs banned for this session. Keyed by identity, not by Nearby handle,
  // so a peer reconnecting with a new endpointId stays banned.
  private blacklist: Set<string> = new Set();

  // endpointId → TempID — needed to look up identity at ban time.
  private endpointToTempID: Map<string, string> = new Map();

  constructor(private readonly disconnectFn: DisconnectFn) {}

  // ---------------------------------------------------------------------------
  // Registration — called by ResonanceEngine when a connection is confirmed.
  // ---------------------------------------------------------------------------

  registerEndpoint(endpointId: string, tempID: string): void {
    this.endpointToTempID.set(endpointId, tempID);
    this.rateWindows.set(endpointId, []);
  }

  unregisterEndpoint(endpointId: string): void {
    this.endpointToTempID.delete(endpointId);
    this.rateWindows.delete(endpointId);
  }

  isBlacklisted(tempID: string): boolean {
    return this.blacklist.has(tempID);
  }

  // ---------------------------------------------------------------------------
  // Main validation pipeline
  // ---------------------------------------------------------------------------

  /**
   * Validate a raw byte payload received from `endpointId`.
   * Returns the parsed RepEvent on success.
   * On ANY violation: bans the peer and throws. Never returns partially.
   */
  async validate(endpointId: string, rawBytes: Uint8Array): Promise<RepEvent> {
    // Step 1 — UTF-8 decode (fatal mode: malformed sequences → immediate ban)
    let text: string;
    try {
      text = new TextDecoder('utf-8').decode(rawBytes);
    } catch {
      return this._ban(endpointId, new InvalidPayloadError(endpointId, 'non-UTF8 bytes'));
    }

    // Step 2 — JSON parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return this._ban(endpointId, new InvalidPayloadError(endpointId, 'malformed JSON'));
    }

    // Step 3 — Schema validation
    if (!isRepEvent(parsed)) {
      return this._ban(endpointId, new InvalidPayloadError(endpointId, 'schema mismatch'));
    }

    // Step 4 — Physics gate (sliding window rate limiter)
    const now = Date.now();
    const window = (this.rateWindows.get(endpointId) ?? []).filter(
      (t) => now - t < RATE_WINDOW_MS,
    );
    if (window.length >= MAX_REPS_IN_WINDOW) {
      return this._ban(endpointId, new CheatDetectedError(endpointId));
    }
    window.push(now);
    this.rateWindows.set(endpointId, window);

    return parsed;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Blacklist the peer's TempID, disconnect them, then throw the violation.
   * Returns Promise<never> so callers can `return this._ban(...)` and TypeScript
   * understands the code-path is unreachable after this call.
   */
  private _ban(endpointId: string, error: Error): Promise<never> {
    const tempID = this.endpointToTempID.get(endpointId);
    if (tempID !== undefined) {
      this.blacklist.add(tempID);
    }
    return this.disconnectFn(endpointId).then(() => {
      throw error;
    });
  }
}
