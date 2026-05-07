import type { P2PAdapter } from './P2PAdapter';

export function createAdapter(): P2PAdapter {
  const { IOSMultipeerAdapter } = require('./IOSMultipeerAdapter');
  return new IOSMultipeerAdapter();
}
