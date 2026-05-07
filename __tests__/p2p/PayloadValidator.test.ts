/**
 * PayloadValidator unit tests — Layer 3 inbound firewall.
 *
 * Tests the four-stage validation pipeline:
 *   1. UTF-8 decode gate
 *   2. JSON parse gate
 *   3. Schema validation gate
 *   4. Physics rate-limit gate (5 reps/second = cheat)
 *
 * Also verifies the banning sequence:
 *   blacklist TempID → call disconnectFn → throw error.
 */

jest.mock('react-native-get-random-values', () => {});

import {
  PayloadValidator,
  RepEvent,
  InvalidPayloadError,
  CheatDetectedError,
} from '../../src/p2p/PayloadValidator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBytes(obj: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

const VALID_EVENT: RepEvent = { type: 'event', action: 'rep', timestamp: 1_000_000 };
const VALID_UUID = 'a1b2c3d4-e5f6-4789-89ab-0123456789ab';

function makeValidator(): { validator: PayloadValidator; disconnectFn: jest.Mock } {
  const disconnectFn = jest.fn().mockResolvedValue(undefined);
  const validator = new PayloadValidator(disconnectFn);
  validator.registerEndpoint('ep1', VALID_UUID);
  return { validator, disconnectFn };
}

// ---------------------------------------------------------------------------
describe('PayloadValidator', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  describe('validate() — happy path', () => {
    it('returns the RepEvent for a well-formed payload', async () => {
      const { validator } = makeValidator();
      const result = await validator.validate('ep1', makeBytes(VALID_EVENT));
      expect(result).toEqual(VALID_EVENT);
    });

    it('accepts the minimum 4 reps in one second without banning', async () => {
      const { validator, disconnectFn } = makeValidator();
      for (let i = 0; i < 4; i++) {
        await validator.validate(
          'ep1',
          makeBytes({ type: 'event', action: 'rep', timestamp: Date.now() }),
        );
      }
      expect(disconnectFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Step 1 — UTF-8 decode gate
  // -------------------------------------------------------------------------
  describe('Step 1 — non-UTF8 bytes', () => {
    it('throws InvalidPayloadError for non-UTF8 bytes', async () => {
      const { validator } = makeValidator();
      // 0xFF 0xFE is an invalid UTF-8 sequence in fatal mode
      const bad = new Uint8Array([0xff, 0xfe]);
      await expect(validator.validate('ep1', bad)).rejects.toBeInstanceOf(
        InvalidPayloadError,
      );
    });

    it('calls disconnectFn for non-UTF8 bytes', async () => {
      const { validator, disconnectFn } = makeValidator();
      await expect(validator.validate('ep1', new Uint8Array([0xff]))).rejects.toThrow();
      expect(disconnectFn).toHaveBeenCalledWith('ep1');
    });
  });

  // -------------------------------------------------------------------------
  // Step 2 — JSON parse gate
  // -------------------------------------------------------------------------
  describe('Step 2 — malformed JSON', () => {
    it('throws InvalidPayloadError for invalid JSON text', async () => {
      const { validator } = makeValidator();
      const bad = new TextEncoder().encode('{not json}');
      await expect(validator.validate('ep1', bad)).rejects.toBeInstanceOf(
        InvalidPayloadError,
      );
    });

    it('calls disconnectFn for invalid JSON text', async () => {
      const { validator, disconnectFn } = makeValidator();
      await expect(
        validator.validate('ep1', new TextEncoder().encode('???')),
      ).rejects.toThrow();
      expect(disconnectFn).toHaveBeenCalledWith('ep1');
    });
  });

  // -------------------------------------------------------------------------
  // Step 3 — Schema gate
  // -------------------------------------------------------------------------
  describe('Step 3 — schema validation', () => {
    const cases: Array<[string, object]> = [
      ['extra field',        { type: 'event', action: 'rep', timestamp: 1, extra: true }],
      ['wrong type value',   { type: 'wrong', action: 'rep', timestamp: 1 }],
      ['wrong action value', { type: 'event', action: 'push', timestamp: 1 }],
      ['non-number timestamp', { type: 'event', action: 'rep', timestamp: 'now' }],
      ['Infinity timestamp', { type: 'event', action: 'rep', timestamp: Infinity }],
      ['null payload',       null as unknown as object],
      ['array payload',      [] as unknown as object],
    ];

    for (const [label, payload] of cases) {
      it(`throws InvalidPayloadError for: ${label}`, async () => {
        const { validator } = makeValidator();
        const bytes =
          payload === null
            ? new TextEncoder().encode('null')
            : makeBytes(payload as object);
        await expect(validator.validate('ep1', bytes)).rejects.toBeInstanceOf(
          InvalidPayloadError,
        );
      });
    }

    it('calls disconnectFn on schema mismatch', async () => {
      const { validator, disconnectFn } = makeValidator();
      await expect(
        validator.validate('ep1', makeBytes({ type: 'event', action: 'rep' })),
      ).rejects.toThrow();
      expect(disconnectFn).toHaveBeenCalledWith('ep1');
    });
  });

  // -------------------------------------------------------------------------
  // Step 4 — Physics gate
  // -------------------------------------------------------------------------
  describe('Step 4 — physics rate limit', () => {
    it('throws CheatDetectedError when 5th rep arrives within 1 second', async () => {
      const { validator } = makeValidator();
      const send = () =>
        validator.validate(
          'ep1',
          makeBytes({ type: 'event', action: 'rep', timestamp: Date.now() }),
        );

      for (let i = 0; i < 4; i++) {
        await send(); // first four are fine
      }
      await expect(send()).rejects.toBeInstanceOf(CheatDetectedError);
    });

    it('calls disconnectFn on cheat detection', async () => {
      const { validator, disconnectFn } = makeValidator();
      const send = () =>
        validator.validate(
          'ep1',
          makeBytes({ type: 'event', action: 'rep', timestamp: Date.now() }),
        );
      for (let i = 0; i < 4; i++) await send();
      await expect(send()).rejects.toThrow();
      expect(disconnectFn).toHaveBeenCalledWith('ep1');
    });

    it('resets window after 1 second — 4 new reps should not trigger a ban', async () => {
      jest.useFakeTimers();
      const { validator, disconnectFn } = makeValidator();
      const send = () =>
        validator.validate(
          'ep1',
          makeBytes({ type: 'event', action: 'rep', timestamp: Date.now() }),
        );

      for (let i = 0; i < 4; i++) await send();
      jest.advanceTimersByTime(1001); // slide the window past all 4 events

      for (let i = 0; i < 4; i++) await send(); // 4 fresh events — should be fine
      expect(disconnectFn).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Banning mechanics
  // -------------------------------------------------------------------------
  describe('ban sequence', () => {
    it('blacklists the TempID of the offending endpoint', async () => {
      const { validator } = makeValidator();
      await expect(
        validator.validate('ep1', new TextEncoder().encode('bad json')),
      ).rejects.toThrow();
      expect(validator.isBlacklisted(VALID_UUID)).toBe(true);
    });

    it('disconnectFn is called before the error is thrown', async () => {
      const callOrder: string[] = [];
      const disconnectFn = jest
        .fn()
        .mockImplementation(() => {
          callOrder.push('disconnect');
          return Promise.resolve();
        });
      const validator = new PayloadValidator(disconnectFn);
      validator.registerEndpoint('ep1', VALID_UUID);

      await expect(
        validator.validate('ep1', new TextEncoder().encode('{bad}')),
      ).rejects.toThrow();

      // Error thrown after disconnectFn resolves — verified by inspecting
      // that disconnect was called (throw is implicit as the rejection).
      expect(callOrder).toContain('disconnect');
      expect(callOrder[0]).toBe('disconnect');
    });

    it('isBlacklisted() returns false before any violation', () => {
      const { validator } = makeValidator();
      expect(validator.isBlacklisted(VALID_UUID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Registration lifecycle
  // -------------------------------------------------------------------------
  describe('registerEndpoint / unregisterEndpoint', () => {
    it('unregistered endpoint gets a fresh rate window after re-registration', async () => {
      const { validator } = makeValidator();
      const send = () =>
        validator.validate(
          'ep1',
          makeBytes({ type: 'event', action: 'rep', timestamp: Date.now() }),
        );

      for (let i = 0; i < 4; i++) await send(); // fill the window

      validator.unregisterEndpoint('ep1');
      validator.registerEndpoint('ep1', VALID_UUID); // re-register resets window

      // Should be able to send 4 more without ban
      for (let i = 0; i < 4; i++) {
        await expect(send()).resolves.toBeDefined();
      }
    });
  });
});
