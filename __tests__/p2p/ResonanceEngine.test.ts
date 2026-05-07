/**
 * ResonanceEngine — Layer 1 / 2 (Ambient P2P) tests.
 *
 * The adapter is injected directly as a plain mock object — no virtual
 * module mocks required.  Tests are now platform-agnostic.
 */

jest.mock('react-native-get-random-values', () => {});

// createAdapter is called only when no adapter is passed to the constructor.
// We always inject a mock, so mock the factory to prevent any import of
// platform-specific native modules.
jest.mock('../../src/p2p/adapters/createAdapter', () => ({
  createAdapter: () => ({}),
}));

import { ResonanceEngine, resonanceEngine } from '../../src/p2p/ResonanceEngine';
import { ghostIdentity } from '../../src/identity/GhostIdentity';
import type { P2PAdapter } from '../../src/p2p/adapters/P2PAdapter';

// ---------------------------------------------------------------------------
// Mock adapter factory
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

// Capture the last callback registered with a given adapter method.
function lastCb<T extends unknown[]>(mock: jest.Mock): (...args: T) => void {
  return mock.mock.calls.at(-1)?.[0] as (...args: T) => void;
}

const VALID_UUID = 'a1b2c3d4-e5f6-4789-89ab-0123456789ab';
const VALID_AMBIENT_NAME = `0:${VALID_UUID}`;

// ---------------------------------------------------------------------------
describe('ResonanceEngine — Phase 1 & 2', () => {
  let engine: ResonanceEngine;
  let adapter: jest.Mocked<P2PAdapter>;

  beforeEach(() => {
    adapter = makeMockAdapter();
    engine = new ResonanceEngine(adapter);
    ghostIdentity.generate();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    ghostIdentity.burn();
  });

  // -------------------------------------------------------------------------
  // startAmbientBroadcast()
  // -------------------------------------------------------------------------
  describe('startAmbientBroadcast()', () => {
    it('throws when ghostIdentity has no active TempID', async () => {
      ghostIdentity.burn();
      await expect(engine.startAmbientBroadcast()).rejects.toThrow(/No active TempID/);
    });

    it('calls startAdvertising with "0:<uuid>" format', async () => {
      const tempID = ghostIdentity.getTempID()!;
      await engine.startAmbientBroadcast();
      expect(adapter.startAdvertising).toHaveBeenCalledWith(`0:${tempID}`);
    });

    it('calls startDiscovery', async () => {
      await engine.startAmbientBroadcast();
      expect(adapter.startDiscovery).toHaveBeenCalledTimes(1);
    });

    it('transitions engineState to "ambient"', async () => {
      expect(engine.getEngineState()).toBe('stopped');
      await engine.startAmbientBroadcast();
      expect(engine.getEngineState()).toBe('ambient');
    });

    it('is idempotent — a second call does not re-advertise', async () => {
      await engine.startAmbientBroadcast();
      await engine.startAmbientBroadcast();
      expect(adapter.startAdvertising).toHaveBeenCalledTimes(1);
    });

    it('SECURITY: never calls requestConnection', async () => {
      await engine.startAmbientBroadcast();
      expect(adapter.requestConnection).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Peer discovery state machine
  // -------------------------------------------------------------------------
  describe('peer discovery', () => {
    beforeEach(async () => {
      await engine.startAmbientBroadcast();
    });

    it('getNearbyTempIDs() starts empty', () => {
      expect(engine.getNearbyTempIDs().size).toBe(0);
    });

    it('adds a peer when onEndpointFound fires with a valid payload', () => {
      lastCb<[string, string]>(adapter.onEndpointFound)('ep1', VALID_AMBIENT_NAME);
      expect(engine.getNearbyTempIDs()).toContain(VALID_UUID);
    });

    it('fires onPeersChanged with updated set on FOUND', async () => {
      const onPeers = jest.fn();
      engine = new ResonanceEngine(adapter);
      await engine.startAmbientBroadcast(onPeers);
      lastCb<[string, string]>(adapter.onEndpointFound)('ep1', VALID_AMBIENT_NAME);
      expect(onPeers).toHaveBeenLastCalledWith(new Set([VALID_UUID]));
    });

    it('silently drops an endpoint with a malformed name', () => {
      lastCb<[string, string]>(adapter.onEndpointFound)('ep-bad', 'garbage');
      expect(engine.getNearbyTempIDs().size).toBe(0);
    });

    it('silently drops an endpoint with a non-UUID tempID', () => {
      lastCb<[string, string]>(adapter.onEndpointFound)('ep-bad', '0:not-a-uuid');
      expect(engine.getNearbyTempIDs().size).toBe(0);
    });

    it('removes a peer when onEndpointLost fires', () => {
      lastCb<[string, string]>(adapter.onEndpointFound)('ep1', VALID_AMBIENT_NAME);
      lastCb<[string]>(adapter.onEndpointLost)('ep1');
      expect(engine.getNearbyTempIDs().size).toBe(0);
    });

    it('tracks multiple peers simultaneously', () => {
      const uuid2 = 'b2c3d4e5-f6a7-4890-9abc-1234567890bc';
      lastCb<[string, string]>(adapter.onEndpointFound)('ep1', VALID_AMBIENT_NAME);
      lastCb<[string, string]>(adapter.onEndpointFound)('ep2', `0:${uuid2}`);
      expect(engine.getNearbyTempIDs().size).toBe(2);
    });

    it('also accepts a seeking-state peer (stateCode "1")', () => {
      lastCb<[string, string]>(adapter.onEndpointFound)('ep3', `1:${VALID_UUID}`);
      expect(engine.getNearbyTempIDs()).toContain(VALID_UUID);
    });
  });

  // -------------------------------------------------------------------------
  // stopAllEndpoints() — kill switch
  // -------------------------------------------------------------------------
  describe('stopAllEndpoints()', () => {
    beforeEach(async () => {
      await engine.startAmbientBroadcast();
    });

    it('calls stopAdvertising', async () => {
      await engine.stopAllEndpoints();
      expect(adapter.stopAdvertising).toHaveBeenCalled();
    });

    it('calls stopDiscovery', async () => {
      await engine.stopAllEndpoints();
      expect(adapter.stopDiscovery).toHaveBeenCalled();
    });

    it('calls adapter.stopAllEndpoints', async () => {
      await engine.stopAllEndpoints();
      expect(adapter.stopAllEndpoints).toHaveBeenCalled();
    });

    it('clears the peer map', async () => {
      lastCb<[string, string]>(adapter.onEndpointFound)('ep1', VALID_AMBIENT_NAME);
      await engine.stopAllEndpoints();
      expect(engine.getNearbyTempIDs().size).toBe(0);
    });

    it('transitions engineState to "stopped"', async () => {
      await engine.stopAllEndpoints();
      expect(engine.getEngineState()).toBe('stopped');
    });

    it('fires onPeersChanged with an empty Set', async () => {
      const onPeers = jest.fn();
      engine = new ResonanceEngine(adapter);
      await engine.startAmbientBroadcast(onPeers);
      lastCb<[string, string]>(adapter.onEndpointFound)('ep1', VALID_AMBIENT_NAME);
      onPeers.mockClear();
      await engine.stopAllEndpoints();
      expect(onPeers).toHaveBeenCalledWith(new Set());
    });

    it('calls remove() on every registered listener', async () => {
      const removes = [
        adapter.onEndpointFound,
        adapter.onEndpointLost,
        adapter.onConnectionInitiated,
        adapter.onConnectionResult,
        adapter.onDisconnected,
        adapter.onPayloadReceived,
      ].map((m) => (m.mock.results.at(-1)?.value as { remove: jest.Mock })?.remove);

      await engine.stopAllEndpoints();
      removes.forEach((r) => expect(r).toHaveBeenCalledTimes(1));
    });
  });

  // -------------------------------------------------------------------------
  // parseEndpointName() — parser
  // -------------------------------------------------------------------------
  describe('parseEndpointName()', () => {
    it('parses a valid ambient payload', () => {
      expect(engine.parseEndpointName(VALID_AMBIENT_NAME)).toEqual({
        stateCode: '0', tempID: VALID_UUID,
      });
    });

    it('parses a valid seeking payload', () => {
      expect(engine.parseEndpointName(`1:${VALID_UUID}`)).toEqual({
        stateCode: '1', tempID: VALID_UUID,
      });
    });

    it('returns null for no colon', () => {
      expect(engine.parseEndpointName('0' + VALID_UUID)).toBeNull();
    });

    it('returns null for unknown stateCode', () => {
      expect(engine.parseEndpointName(`9:${VALID_UUID}`)).toBeNull();
    });

    it('returns null for non-UUID tempID', () => {
      expect(engine.parseEndpointName('0:not-a-uuid')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(engine.parseEndpointName('')).toBeNull();
    });

    it('returns null for UUID v1 (wrong version digit)', () => {
      expect(engine.parseEndpointName('0:a1b2c3d4-e5f6-1789-89ab-0123456789ab')).toBeNull();
    });

    it('returns null for invalid variant nibble', () => {
      expect(engine.parseEndpointName('0:a1b2c3d4-e5f6-4789-07ab-0123456789ab')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Module singleton
  // -------------------------------------------------------------------------
  it('resonanceEngine singleton is an instance of ResonanceEngine', () => {
    expect(resonanceEngine).toBeInstanceOf(ResonanceEngine);
  });
});
