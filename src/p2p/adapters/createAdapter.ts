/**
 * createAdapter — platform factory stub.
 *
 * Metro resolves createAdapter.android.ts or createAdapter.ios.ts at build
 * time. This file is the Jest fallback; tests mock the module entirely so
 * this body never runs.
 */

import type { P2PAdapter } from './P2PAdapter';

export function createAdapter(): P2PAdapter {
  throw new Error('[createAdapter] No adapter registered for this platform.');
}
