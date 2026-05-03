/**
 * Mobile libp2p stack (WebSockets + WebRTC transports — no TCP).
 * Uses mplex (not yamux): Metro/Hermes can hit circular ESM init bugs in @chainsafe/libp2p-yamux.
 *
 * React Native has no Web Workers; startup work is scheduled with
 * `InteractionManager.runAfterInteractions` + microtasks so the first UI paint
 * is not blocked (closest practical equivalent).
 */
import { identify } from '@libp2p/identify';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import * as circuitRelay from '@libp2p/circuit-relay-v2';
import { mplex } from '@libp2p/mplex';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { createLibp2p } from 'libp2p';
import { multiaddr } from '@multiformats/multiaddr';
import { InteractionManager } from 'react-native';
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';

/** Metro occasionally mis-resolves ESM named exports; support default-interop too. */
function getCircuitRelayTransportFactory() {
  const named = circuitRelay.circuitRelayTransport;
  if (typeof named === 'function') {
    return named;
  }
  const fromDefault = circuitRelay.default?.circuitRelayTransport;
  if (typeof fromDefault === 'function') {
    return fromDefault;
  }
  throw new Error(
    `[PeerToPeer] @libp2p/circuit-relay-v2 did not load (keys: ${Object.keys(circuitRelay).join(', ')}). Try: npx react-native start --reset-cache`,
  );
}

export const WORKOUT_SUMMARIES_TOPIC = 'workout-summaries';

const ALLOWED_AUTH_TOKENS = ['p2p-demo-alpha', 'p2p-demo-beta'];

/** @param {string | undefined} token */
function createAuthTokenConnectionGater(token) {
  const ok = token != null && ALLOWED_AUTH_TOKENS.includes(token);
  return {
    denyInboundEncryptedConnection() {
      return !ok;
    },
    denyOutboundEncryptedConnection() {
      return !ok;
    },
  };
}

/**
 * Schedule async work off the critical UI path (RN has no Worker API).
 * Prefer requestIdleCallback — InteractionManager.runAfterInteractions is deprecated on newer RN.
 */
function runDeferred(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      queueMicrotask(() => {
        Promise.resolve(fn()).then(resolve, reject);
      });
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      InteractionManager.runAfterInteractions(run);
    }
  });
}

/**
 * @typedef {'athlete' | 'coach' | 'nutrition'} Role
 */

/**
 * @param {object} opts
 * @param {Role} opts.role
 * @param {string} opts.authToken
 * @param {string | undefined} opts.bootstrapAddr  Full multiaddr string (e.g. `/dns4/…/tcp/443/tls/wss/ws/p2p/…`).
 * @param {(s: 'idle' | 'connecting' | 'online' | 'error') => void} [opts.onStatus]
 * @param {(msg: Record<string, unknown>) => void} [opts.onMessage]
 * @param {(line: string) => void} [opts.onLog]
 */
export function createMobileNode({
  role,
  authToken,
  bootstrapAddr,
  onStatus,
  onMessage,
  onLog,
}) {
  const VALID_ROLES = new Set(['athlete', 'coach', 'nutrition']);
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  /** @type {Awaited<ReturnType<typeof createLibp2p>> | null} */
  let node = null;
  /** @param {Event} evt */
  let messageHandler = null;

  return {
    /**
     * Start libp2p, subscribe to gossipsub, optionally dial bootstrap.
     */
    start() {
      return runDeferred(async () => {
        onStatus?.('connecting');
        onLog?.('Creating libp2p node (WS + WebRTC)...');

        const privateKey = await generateKeyPair('Ed25519');
        const connectionGater = createAuthTokenConnectionGater(authToken);

        const circuitRelayTransport = getCircuitRelayTransportFactory();

        node = await createLibp2p({
          privateKey,
          addresses: {
            listen: [],
          },
          transports: [
            webSockets(),
            webRTC(),
            circuitRelayTransport(),
          ],
          connectionEncrypters: [noise()],
          streamMuxers: [mplex()],
          connectionGater,
          services: {
            identify: identify(),
            pubsub: gossipsub({
              emitSelf: false,
              allowPublishToZeroTopicPeers: true,
            }),
          },
          start: false,
        });

        await node.start();
        onLog?.(`PeerID: ${node.peerId.toString()}`);

        node.services.pubsub.subscribe(WORKOUT_SUMMARIES_TOPIC);

        messageHandler = (evt) => {
          try {
            const d = evt.detail;
            const topic = 'topic' in d ? d.topic : null;
            if (topic !== WORKOUT_SUMMARIES_TOPIC) {
              return;
            }
            if (!('data' in d) || d.data == null) {
              return;
            }
            const text = new TextDecoder().decode(
              /** @type {Uint8Array} */ (d.data),
            );
            const parsed = JSON.parse(text);
            onMessage?.(parsed);
          } catch (e) {
            onLog?.(
              `Message error: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        };
        node.services.pubsub.addEventListener('message', messageHandler);

        if (bootstrapAddr != null && String(bootstrapAddr).trim() !== '') {
          const trimmed = String(bootstrapAddr).trim();
          onLog?.(`Dialing bootstrap: ${trimmed}`);
          try {
            await node.dial(multiaddr(trimmed));
            onLog?.('Bootstrap dial completed');
          } catch (e) {
            onLog?.(
              `Bootstrap dial failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            onStatus?.('error');
            return;
          }
        } else {
          onLog?.('No BOOTSTRAP_ADDR — skipping bootstrap dial');
        }

        onStatus?.('online');
      });
    },

    /**
     * Stop the node and release listeners.
     */
    stop() {
      return runDeferred(async () => {
        if (node == null) {
          onStatus?.('idle');
          return;
        }
        onStatus?.('connecting');
        if (messageHandler != null) {
          node.services.pubsub.removeEventListener('message', messageHandler);
          messageHandler = null;
        }
        await node.stop();
        node = null;
        onLog?.('libp2p stopped');
        onStatus?.('idle');
      });
    },

    getPeerId() {
      return node?.peerId?.toString() ?? null;
    },

    getRole() {
      return role;
    },

    /**
     * Publish a workout summary (athlete role only). Payload must match app expectations.
     * @param {{ user: string, exercise: string, reps: number, date?: string }} payload
     */
    async publishWorkoutSummary(payload) {
      if (role !== 'athlete') {
        throw new Error('Only athlete role can publish workout summaries');
      }
      if (node == null) {
        throw new Error('Node not started');
      }
      const body = {
        user: payload.user,
        exercise: payload.exercise,
        reps: payload.reps,
        date: payload.date ?? new Date().toISOString(),
        role: 'athlete',
      };
      await node.services.pubsub.publish(
        WORKOUT_SUMMARIES_TOPIC,
        uint8ArrayFromString(JSON.stringify(body)),
      );
      onLog?.(`Published workout summary: ${body.exercise} x ${body.reps}`);
    },
  };
}
