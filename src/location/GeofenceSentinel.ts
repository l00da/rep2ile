/**
 * GeofenceSentinel — physical boundary watchdog.
 *
 * Responsibilities:
 *  1. Monitor device position against a hardcoded venue polygon.
 *  2. On ENTER → call ghostIdentity.generate()  (ignite TempID).
 *  3. On EXIT  → call ghostIdentity.burn()       (incinerate TempID + trigger
 *                engine shutdown upstream).
 *
 * Security contract:
 *  - All computation is on-device. No coordinates, venue data, or user position
 *    are sent to any remote endpoint.
 *  - The sentinel only controls identity lifecycle; it does NOT call any Nearby
 *    API directly. That separation means a permission denial can never leave a
 *    "ghost" TempID alive without a matching radio context.
 *
 * Dependency: expo-location  (install: npx expo install expo-location)
 * Also add the following to android/app/src/main/AndroidManifest.xml:
 *   <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
 * And to ios/PeerToPeer/Info.plist:
 *   NSLocationWhenInUseUsageDescription
 *   NSLocationAlwaysAndWhenInUseUsageDescription
 */

import * as Location from 'expo-location';
import { ghostIdentity } from '../identity/GhostIdentity';

// ---------------------------------------------------------------------------
// Hardcoded test venue — Boston University FitRec Center.
// Replace lat/lng/radius before deploying to a real gym.
// ---------------------------------------------------------------------------
const TEST_VENUE = {
  name: 'BU FitRec (test)',
  latitude: 42.3505,
  longitude: -71.1054,
  radiusMeters: 100,
} as const;

// ---------------------------------------------------------------------------
// Haversine distance (on-device, no network)
// ---------------------------------------------------------------------------

/**
 * Returns the great-circle distance in meters between two WGS-84 coordinates.
 * Accurate to ±0.5 % for distances under 1 km — sufficient for a 100 m radius.
 */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // mean Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GeofenceEvent = 'ENTER' | 'EXIT';

/**
 * Callback invoked on boundary transitions.
 * The caller (typically the root app component) uses ENTER/EXIT to drive the
 * Nearby engine lifecycle — the sentinel itself never touches the radio.
 */
export type GeofenceCallback = (event: GeofenceEvent) => void;

// ---------------------------------------------------------------------------
// GeofenceSentinel class
// ---------------------------------------------------------------------------

export class GeofenceSentinel {
  private subscription: Location.LocationSubscription | null = null;
  private insideVenue = false;
  private onEvent: GeofenceCallback | null = null;

  /**
   * Request foreground + background location permissions.
   * Returns true only when both grants succeed.
   * Background permission is required so the OS can wake the app when the
   * user physically exits the venue while the screen is off.
   */
  async requestPermissions(): Promise<boolean> {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') {
      return false;
    }
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    return bg === 'granted';
  }

  /**
   * Begin position sampling and register the event callback.
   * The accuracy is set to Balanced (city block resolution) rather than High
   * to reduce battery drain — we only need ~10 m precision for a 100 m radius.
   * Calling startWatching() when already active is a no-op.
   */
  async startWatching(onEvent?: GeofenceCallback): Promise<void> {
    if (this.subscription !== null) {
      return;
    }
    this.onEvent = onEvent ?? null;

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,   // re-evaluate at most once every 10 s
        distanceInterval: 10,   // or whenever the device moves ≥ 10 m
      },
      (loc) => this.handlePosition(loc),
    );
  }

  /** Remove the position subscription and silence the callback. */
  stopWatching(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.onEvent = null;
    // Do NOT call burn() here — stopWatching is called by the app for cleanup
    // purposes; only an explicit EXIT event should incinerate the identity.
  }

  /** True when the last sampled position was inside the venue radius. */
  isInsideVenue(): boolean {
    return this.insideVenue;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handlePosition(location: Location.LocationObject): void {
    const { latitude, longitude } = location.coords;

    const dist = haversineMeters(
      latitude,
      longitude,
      TEST_VENUE.latitude,
      TEST_VENUE.longitude,
    );

    const nowInside = dist <= TEST_VENUE.radiusMeters;

    if (nowInside && !this.insideVenue) {
      // Crossed the boundary inward → ignite identity, then notify
      this.insideVenue = true;
      ghostIdentity.generate();
      this.onEvent?.('ENTER');
    } else if (!nowInside && this.insideVenue) {
      // Crossed the boundary outward → incinerate identity first, then notify
      // The order matters: the upstream engine must not attempt to read the ID
      // after burn() has been called, so we destroy it before the callback fires.
      this.insideVenue = false;
      ghostIdentity.burn();
      this.onEvent?.('EXIT');
    }
    // Positions that don't cross the boundary are silently discarded.
  }
}

/**
 * Module-level singleton — shared with the rest of the app via this export.
 * Import { geofenceSentinel } wherever you need to check venue status.
 */
export const geofenceSentinel = new GeofenceSentinel();
