/**
 * GhostIdentity — ephemeral TempID manager.
 *
 * Security contract:
 *  - The TempID lives ONLY in this module's closure. It is never written to
 *    AsyncStorage, SQLite, or any persistent medium.
 *  - Calling burn() sets the reference to null so the UUID becomes unreachable
 *    and eligible for GC immediately.
 *  - generate() is idempotent: calling it twice returns the same ID rather than
 *    minting a second one that could create a detectable linkage between sessions.
 */

import 'react-native-get-random-values'; // polyfills crypto.getRandomValues on Hermes

/**
 * Produce a version-4 UUID using the device CSPRNG.
 * We call crypto.getRandomValues directly so the entropy source is explicit and
 * auditable — we never fall back to Math.random().
 */
function mintUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // RFC 4122 §4.4: set version bits (4) and variant bits (0b10xx)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return (
    `${hex.slice(0, 8)}-` +
    `${hex.slice(8, 12)}-` +
    `${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-` +
    `${hex.slice(20)}`
  );
}

export class GhostIdentity {
  /** Sole in-memory store — never leaves this variable. */
  private tempID: string | null = null;

  /**
   * Ignite a new TempID. Idempotent: returns the existing ID if already active
   * so the caller never accidentally cycles identities mid-session.
   */
  generate(): string {
    if (this.tempID === null) {
      this.tempID = mintUUID();
    }
    return this.tempID;
  }

  /**
   * Incinerate the TempID. After this call no reference to the previous UUID
   * survives inside this module. The caller must not cache the old return value
   * of getTempID() — that would be an identity leak.
   */
  burn(): void {
    this.tempID = null;
  }

  /** Returns the active TempID, or null if identity has been burned. */
  getTempID(): string | null {
    return this.tempID;
  }

  /** Convenience predicate used by the engine before attempting to broadcast. */
  isActive(): boolean {
    return this.tempID !== null;
  }
}

/**
 * Module-level singleton — one identity per JS runtime process.
 * Shared by GeofenceSentinel and ResonanceEngine so they always agree on
 * the current TempID without passing it through props.
 */
export const ghostIdentity = new GhostIdentity();
