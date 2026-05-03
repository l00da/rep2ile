/**
 * libp2p uses `main-event` (extends EventTarget) and `progress-events` (extends Event).
 * Hermes may ship incomplete Event / EventTarget / CustomEvent, which leads to errors
 * inside event handling (e.g. missing internal `event` on wrapper objects).
 * Load this file before any libp2p-related imports.
 */
import { Event as EventShim, EventTarget as EventTargetShim } from 'event-target-shim';

const g = globalThis;

g.EventTarget = EventTargetShim;
g.Event = EventShim;

g.CustomEvent = class CustomEvent extends g.Event {
  constructor(type, init = {}) {
    super(type);
    this.detail = init.detail ?? null;
  }
};
