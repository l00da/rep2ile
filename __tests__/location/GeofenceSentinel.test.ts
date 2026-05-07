/**
 * GeofenceSentinel unit tests.
 *
 * All expo-location calls are mocked so no native modules are loaded.
 * ghostIdentity methods are spied on to verify that:
 *  - generate() is called on ENTER (and only then).
 *  - burn()     is called on EXIT  (and only then).
 *  - burn() is called BEFORE the EXIT callback fires (safety ordering).
 *
 * Test coordinates reference the hardcoded BU FitRec venue (lat 42.3505, lon -71.1054, r 100 m).
 *  INSIDE  → (42.3505, -71.1054) distance = 0 m   → inside fence
 *  OUTSIDE → (42.3523, -71.1054) distance ≈ 200 m → outside fence
 */

jest.mock('react-native-get-random-values', () => {});

// Declare the mock before any imports so Jest's hoisting can find it.
// { virtual: true } lets Jest use this factory even though expo-location is not
// installed yet — the real package is only needed at runtime on a device.
// Individual test behaviour is configured in beforeEach via jest.mocked().
jest.mock(
  'expo-location',
  () => ({
    Accuracy: { Balanced: 3 },
    requestForegroundPermissionsAsync: jest.fn(),
    requestBackgroundPermissionsAsync: jest.fn(),
    watchPositionAsync: jest.fn(),
  }),
  { virtual: true },
);

import * as Location from 'expo-location';
import { GeofenceSentinel, geofenceSentinel, GeofenceEvent } from '../../src/location/GeofenceSentinel';
import { ghostIdentity } from '../../src/identity/GhostIdentity';

// ---------------------------------------------------------------------------
// Coordinate fixtures (relative to hardcoded venue in GeofenceSentinel.ts)
// ---------------------------------------------------------------------------
const INSIDE = { latitude: 42.3505, longitude: -71.1054 };   // 0 m from centre
const OUTSIDE = { latitude: 42.3523, longitude: -71.1054 };  // ~200 m north

function fakeLocation(coords: { latitude: number; longitude: number }): Location.LocationObject {
  return {
    coords: {
      ...coords,
      altitude: null,
      accuracy: 10,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as unknown as Location.LocationObject;
}

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------
describe('GeofenceSentinel', () => {
  let sentinel: GeofenceSentinel;
  // Callback captured by the watchPositionAsync mock — lets tests drive position updates.
  let positionCallback: ((loc: Location.LocationObject) => void) | null;
  let generateSpy: jest.SpyInstance;
  let burnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset call counts on all jest.fn() instances created by jest.mock() factories
    // so each test starts with a clean slate without affecting implementations.
    jest.clearAllMocks();

    sentinel = new GeofenceSentinel();
    positionCallback = null;

    // Default mock implementations (overridable per-test).
    jest.mocked(Location.watchPositionAsync).mockImplementation((_opts, cb) => {
      positionCallback = cb as (loc: Location.LocationObject) => void;
      return Promise.resolve({ remove: jest.fn() });
    });
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(
      { status: 'granted' } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>,
    );
    jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue(
      { status: 'granted' } as Awaited<ReturnType<typeof Location.requestBackgroundPermissionsAsync>>,
    );

    // Spy with call-through (default jest.spyOn behaviour) so real generate/burn still run.
    generateSpy = jest.spyOn(ghostIdentity, 'generate');
    burnSpy = jest.spyOn(ghostIdentity, 'burn');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Ensure no stale TempID bleeds between tests.
    ghostIdentity.burn();
  });

  // -------------------------------------------------------------------------
  // requestPermissions()
  // -------------------------------------------------------------------------
  describe('requestPermissions()', () => {
    it('returns true when both foreground and background permissions are granted', async () => {
      expect(await sentinel.requestPermissions()).toBe(true);
    });

    it('returns false when foreground permission is denied', async () => {
      jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce(
        { status: 'denied' } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>,
      );
      expect(await sentinel.requestPermissions()).toBe(false);
    });

    it('returns false when background permission is denied', async () => {
      jest.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValueOnce(
        { status: 'denied' } as Awaited<ReturnType<typeof Location.requestBackgroundPermissionsAsync>>,
      );
      expect(await sentinel.requestPermissions()).toBe(false);
    });

    it('does not request background permission when foreground is denied first', async () => {
      jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce(
        { status: 'denied' } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>,
      );
      await sentinel.requestPermissions();
      expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // startWatching()
  // -------------------------------------------------------------------------
  describe('startWatching()', () => {
    it('registers a watchPositionAsync subscription', async () => {
      await sentinel.startWatching();
      expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — calling twice registers only one subscription', async () => {
      await sentinel.startWatching();
      await sentinel.startWatching();
      expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // ENTER transition
  // -------------------------------------------------------------------------
  describe('ENTER transition (outside → inside)', () => {
    it('fires the ENTER callback when the device enters the venue', async () => {
      const onEvent = jest.fn();
      await sentinel.startWatching(onEvent);
      positionCallback!(fakeLocation(INSIDE));
      expect(onEvent).toHaveBeenCalledWith('ENTER');
    });

    it('calls ghostIdentity.generate() on ENTER', async () => {
      await sentinel.startWatching();
      positionCallback!(fakeLocation(INSIDE));
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });

    it('sets isInsideVenue() to true after ENTER', async () => {
      await sentinel.startWatching();
      expect(sentinel.isInsideVenue()).toBe(false);
      positionCallback!(fakeLocation(INSIDE));
      expect(sentinel.isInsideVenue()).toBe(true);
    });

    it('does NOT fire a duplicate ENTER for consecutive inside-position updates', async () => {
      const onEvent = jest.fn();
      await sentinel.startWatching(onEvent);
      positionCallback!(fakeLocation(INSIDE));
      positionCallback!(fakeLocation(INSIDE)); // second sample still inside
      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire ENTER for a position that stays outside the venue', async () => {
      const onEvent = jest.fn();
      await sentinel.startWatching(onEvent);
      positionCallback!(fakeLocation(OUTSIDE));
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // EXIT transition
  // -------------------------------------------------------------------------
  describe('EXIT transition (inside → outside)', () => {
    // Helper: drive the sentinel into the ENTER state so EXIT tests start clean.
    async function enterVenue(onEvent?: jest.Mock<void, [GeofenceEvent]>): Promise<void> {
      await sentinel.startWatching(onEvent);
      positionCallback!(fakeLocation(INSIDE));
      // Clear spy counters so EXIT-phase assertions are isolated.
      generateSpy.mockClear();
      burnSpy.mockClear();
      onEvent?.mockClear();
    }

    it('fires the EXIT callback when the device leaves the venue', async () => {
      const onEvent = jest.fn();
      await enterVenue(onEvent);
      positionCallback!(fakeLocation(OUTSIDE));
      expect(onEvent).toHaveBeenCalledWith('EXIT');
    });

    it('calls ghostIdentity.burn() on EXIT', async () => {
      await enterVenue();
      positionCallback!(fakeLocation(OUTSIDE));
      expect(burnSpy).toHaveBeenCalledTimes(1);
    });

    it('calls burn() BEFORE firing the EXIT callback (identity incinerated first)', async () => {
      const callOrder: string[] = [];
      // Replace burn with a tracker (real field clear not needed for order test).
      burnSpy.mockImplementation(() => callOrder.push('burn'));
      const onEvent = jest.fn(() => callOrder.push('callback'));

      await sentinel.startWatching(onEvent);
      positionCallback!(fakeLocation(INSIDE));
      callOrder.length = 0; // reset — only care about EXIT ordering

      positionCallback!(fakeLocation(OUTSIDE));
      expect(callOrder).toEqual(['burn', 'callback']);
    });

    it('sets isInsideVenue() to false after EXIT', async () => {
      await enterVenue();
      positionCallback!(fakeLocation(OUTSIDE));
      expect(sentinel.isInsideVenue()).toBe(false);
    });

    it('does NOT fire a duplicate EXIT for consecutive outside-position updates', async () => {
      const onEvent = jest.fn();
      await enterVenue(onEvent);
      positionCallback!(fakeLocation(OUTSIDE));
      positionCallback!(fakeLocation(OUTSIDE)); // second sample still outside
      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it('does NOT call generate() on EXIT', async () => {
      await enterVenue();
      positionCallback!(fakeLocation(OUTSIDE));
      expect(generateSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stopWatching()
  // -------------------------------------------------------------------------
  describe('stopWatching()', () => {
    it('calls remove() on the active subscription', async () => {
      const removeFn = jest.fn();
      jest.mocked(Location.watchPositionAsync).mockResolvedValueOnce(
        { remove: removeFn } as unknown as Location.LocationSubscription,
      );
      await sentinel.startWatching();
      sentinel.stopWatching();
      expect(removeFn).toHaveBeenCalledTimes(1);
    });

    it('does NOT call ghostIdentity.burn() — only an EXIT event should incinerate the identity', async () => {
      await sentinel.startWatching();
      positionCallback!(fakeLocation(INSIDE)); // enter so identity is active
      burnSpy.mockClear();

      sentinel.stopWatching();
      expect(burnSpy).not.toHaveBeenCalled();
    });

    it('is safe to call when not watching (does not throw)', () => {
      expect(() => sentinel.stopWatching()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Module-level singleton
  // -------------------------------------------------------------------------
  describe('geofenceSentinel singleton', () => {
    it('is an instance of GeofenceSentinel', () => {
      expect(geofenceSentinel).toBeInstanceOf(GeofenceSentinel);
    });
  });
});
