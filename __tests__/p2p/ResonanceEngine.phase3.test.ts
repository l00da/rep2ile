/**
 * ResonanceEngine — Phase 3 (Arena Layer) tests.
 * Uses adapter injection — no native module mocks needed.
 */

jest.mock('react-native-get-random-values', () => {});
jest.mock('../../src/p2p/adapters/createAdapter', () => ({
  createAdapter: () => ({}),
}));

import { ResonanceEngine } from '../../src/p2p/ResonanceEngine';
import { ghostIdentity } from '../../src/identity/GhostIdentity';
import type { P2PAdapter } from '../../src/p2p/adapters/P2PAdapter';

// ---------------------------------------------------------------------------
function makeMockAdapter(): jest.Mocked<P2PAdapter> {
  const sub = () => ({ remove: jest.fn() });
  return {
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
  };
}

function lastCb<T extends unknown[]>(mock: jest.Mock): (...args: T) => void {
  return mock.mock.calls.at(-1)?.[0] as (...args: T) => void;
}

const UUID_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const AMBIENT_B = `0:${UUID_B}`;
const SEEKING_B = `1:${UUID_B}`;

// ---------------------------------------------------------------------------
describe('ResonanceEngine — Phase 3 Arena', () => {
  let engine: ResonanceEngine;
  let adapter: jest.Mocked<P2PAdapter>;

  beforeEach(async () => {
    adapter = makeMockAdapter();
    engine = new ResonanceEngine(adapter);
    ghostIdentity.generate();

    // Seed peerMap: fire the onEndpointFound callback immediately on register.
    adapter.onEndpointFound.mockImplementationOnce((cb) => {
      cb('ep_B', AMBIENT_B);
      return { remove: jest.fn() };
    });
    await engine.startAmbientBroadcast();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ghostIdentity.burn();
  });

  // -------------------------------------------------------------------------
  // initiateChallenge()
  // -------------------------------------------------------------------------
  describe('initiateChallenge()', () => {
    it('throws when engine is stopped', async () => {
      const stopped = new ResonanceEngine(adapter);
      await expect(stopped.initiateChallenge('ep_B')).rejects.toThrow(/not running/);
    });

    it('calls requestConnection with "1:<myTempID>" and target endpoint', async () => {
      const myID = ghostIdentity.getTempID()!;
      await engine.initiateChallenge('ep_B');
      expect(adapter.requestConnection).toHaveBeenCalledWith(`1:${myID}`, 'ep_B');
    });

    it('re-advertises with stateCode "1" before calling requestConnection', async () => {
      await engine.initiateChallenge('ep_B');
      expect(adapter.stopAdvertising).toHaveBeenCalled();
      const lastAdvName = adapter.startAdvertising.mock.calls.at(-1)![0];
      expect(lastAdvName).toMatch(/^1:/);
    });

    it('transitions engineState to "seeking"', async () => {
      await engine.initiateChallenge('ep_B');
      expect(engine.getEngineState()).toBe('seeking');
    });

    it('throws when the target TempID is blacklisted', async () => {
      jest
        .spyOn(
          (engine as unknown as { validator: { isBlacklisted: (id: string) => boolean } })
            .validator,
          'isBlacklisted',
        )
        .mockReturnValue(true);
      await expect(engine.initiateChallenge('ep_B')).rejects.toThrow(/blacklisted/);
    });
  });

  // -------------------------------------------------------------------------
  // Connection handshake
  // -------------------------------------------------------------------------
  describe('onConnectionInitiated', () => {
    it('calls acceptConnection for a known, non-blacklisted peer', async () => {
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
      expect(adapter.acceptConnection).toHaveBeenCalledWith('ep_B');
    });

    it('calls rejectConnection for a malformed endpointName', async () => {
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_X', 'garbage');
      await Promise.resolve();
      expect(adapter.rejectConnection).toHaveBeenCalledWith('ep_X');
      expect(adapter.acceptConnection).not.toHaveBeenCalled();
    });

    it('calls rejectConnection when TempID is blacklisted', async () => {
      jest
        .spyOn(
          (engine as unknown as { validator: { isBlacklisted: (id: string) => boolean } })
            .validator,
          'isBlacklisted',
        )
        .mockReturnValue(true);
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
      expect(adapter.rejectConnection).toHaveBeenCalledWith('ep_B');
    });
  });

  // -------------------------------------------------------------------------
  // onConnectionResult
  // -------------------------------------------------------------------------
  describe('onConnectionResult', () => {
    beforeEach(async () => {
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
    });

    it('adds peer to arenaMap on success', () => {
      lastCb<[string, boolean]>(adapter.onConnectionResult)('ep_B', true);
      expect(engine.getConnectedPeerCount()).toBe(1);
    });

    it('does NOT add peer on failure', () => {
      lastCb<[string, boolean]>(adapter.onConnectionResult)('ep_B', false);
      expect(engine.getConnectedPeerCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // onDisconnected
  // -------------------------------------------------------------------------
  describe('onDisconnected', () => {
    beforeEach(async () => {
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
      lastCb<[string, boolean]>(adapter.onConnectionResult)('ep_B', true);
    });

    it('removes peer from arenaMap', () => {
      expect(engine.getConnectedPeerCount()).toBe(1);
      lastCb<[string]>(adapter.onDisconnected)('ep_B');
      expect(engine.getConnectedPeerCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // sendRepEvent()
  // -------------------------------------------------------------------------
  describe('sendRepEvent()', () => {
    beforeEach(async () => {
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
      lastCb<[string, boolean]>(adapter.onConnectionResult)('ep_B', true);
    });

    it('sends a valid RepEvent JSON payload', async () => {
      await engine.sendRepEvent('ep_B');
      const [id, bytes] = adapter.sendPayload.mock.calls[0];
      expect(id).toBe('ep_B');
      const parsed = JSON.parse(new TextDecoder().decode(bytes as Uint8Array));
      expect(parsed).toMatchObject({ type: 'event', action: 'rep' });
      expect(typeof parsed.timestamp).toBe('number');
    });

    it('throws when endpoint is not in arenaMap', async () => {
      await expect(engine.sendRepEvent('ep_unknown')).rejects.toThrow(/not in an active Arena/);
    });
  });

  // -------------------------------------------------------------------------
  // onPayloadReceived
  // -------------------------------------------------------------------------
  describe('onPayloadReceived', () => {
    it('fires onRepReceived for a valid BYTES payload after connection', async () => {
      const onRep = jest.fn();
      adapter = makeMockAdapter();
      adapter.onEndpointFound.mockImplementationOnce((cb) => {
        cb('ep_B', AMBIENT_B);
        return { remove: jest.fn() };
      });
      engine = new ResonanceEngine(adapter);
      ghostIdentity.burn();
      ghostIdentity.generate();
      await engine.startAmbientBroadcast(undefined, onRep);

      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
      lastCb<[string, boolean]>(adapter.onConnectionResult)('ep_B', true);

      const bytes = new TextEncoder().encode(
        JSON.stringify({ type: 'event', action: 'rep', timestamp: Date.now() }),
      );
      lastCb<[string, number, unknown]>(adapter.onPayloadReceived)('ep_B', 1, bytes);
      await Promise.resolve();

      expect(onRep).toHaveBeenCalledTimes(1);
      expect(onRep.mock.calls[0][0]).toMatchObject({ type: 'event', action: 'rep' });
    });

    it('ignores non-BYTES payload types', async () => {
      const onRep = jest.fn();
      engine = new ResonanceEngine(adapter);
      ghostIdentity.burn();
      ghostIdentity.generate();
      await engine.startAmbientBroadcast(undefined, onRep);
      const bytes = new TextEncoder().encode('{}');
      lastCb<[string, number, unknown]>(adapter.onPayloadReceived)('ep_B', 2, bytes);
      lastCb<[string, number, unknown]>(adapter.onPayloadReceived)('ep_B', 3, bytes);
      await Promise.resolve();
      expect(onRep).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stopAllEndpoints() — Phase 3 cleanup
  // -------------------------------------------------------------------------
  describe('stopAllEndpoints() — arena teardown', () => {
    beforeEach(async () => {
      lastCb<[string, string]>(adapter.onConnectionInitiated)('ep_B', SEEKING_B);
      await Promise.resolve();
      lastCb<[string, boolean]>(adapter.onConnectionResult)('ep_B', true);
    });

    it('clears arenaMap', async () => {
      expect(engine.getConnectedPeerCount()).toBe(1);
      await engine.stopAllEndpoints();
      expect(engine.getConnectedPeerCount()).toBe(0);
    });

    it('returns engine to "stopped" state', async () => {
      await engine.stopAllEndpoints();
      expect(engine.getEngineState()).toBe('stopped');
    });
  });
});
