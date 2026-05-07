/**
 * GhostIdentity unit tests.
 *
 * Verifies that:
 *  - TempID is never present before generate() is called.
 *  - generate() produces a cryptographically valid UUID v4.
 *  - generate() is idempotent (same session → same ID).
 *  - burn() nullifies the ID with no observable side-effects.
 *  - A post-burn generate() mints a FRESH UUID distinct from the prior one.
 */

// react-native-get-random-values is a React Native native module shim.
// Node 22 already provides crypto.getRandomValues, so we stub the import to a no-op.
jest.mock('react-native-get-random-values', () => {});

import { GhostIdentity, ghostIdentity } from '../../src/identity/GhostIdentity';

// RFC 4122 §4.4 — version 4, variant 0b10xx
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('GhostIdentity', () => {
  // Use a fresh class instance per test so the singleton state never leaks.
  let id: GhostIdentity;

  beforeEach(() => {
    id = new GhostIdentity();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe('initial state', () => {
    it('isActive() is false before any generate() call', () => {
      expect(id.isActive()).toBe(false);
    });

    it('getTempID() returns null before any generate() call', () => {
      expect(id.getTempID()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // generate()
  // ---------------------------------------------------------------------------

  describe('generate()', () => {
    it('returns a valid UUID v4 string', () => {
      expect(id.generate()).toMatch(UUID_V4);
    });

    it('sets isActive() to true', () => {
      id.generate();
      expect(id.isActive()).toBe(true);
    });

    it('getTempID() reflects the value returned by generate()', () => {
      const returned = id.generate();
      expect(id.getTempID()).toBe(returned);
    });

    it('is idempotent — repeated calls return the same UUID', () => {
      const first = id.generate();
      const second = id.generate();
      expect(second).toBe(first);
    });
  });

  // ---------------------------------------------------------------------------
  // burn()
  // ---------------------------------------------------------------------------

  describe('burn()', () => {
    it('sets getTempID() back to null', () => {
      id.generate();
      id.burn();
      expect(id.getTempID()).toBeNull();
    });

    it('sets isActive() back to false', () => {
      id.generate();
      id.burn();
      expect(id.isActive()).toBe(false);
    });

    it('is safe to call when no ID is active (does not throw)', () => {
      expect(() => id.burn()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Re-generate after burn
  // ---------------------------------------------------------------------------

  describe('re-generate after burn()', () => {
    it('produces a UUID distinct from the burned one', () => {
      const first = id.generate();
      id.burn();
      const second = id.generate();
      // Two independently generated UUIDs must not collide.
      expect(second).not.toBe(first);
    });

    it('the new UUID is still a valid UUID v4', () => {
      id.generate();
      id.burn();
      expect(id.generate()).toMatch(UUID_V4);
    });

    it('isActive() returns true again after re-generate', () => {
      id.generate();
      id.burn();
      id.generate();
      expect(id.isActive()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Module-level singleton
  // ---------------------------------------------------------------------------

  describe('ghostIdentity singleton', () => {
    it('is an instance of GhostIdentity', () => {
      expect(ghostIdentity).toBeInstanceOf(GhostIdentity);
    });
  });
});
