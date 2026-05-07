# P2P libp2p Foundation (Pass A)

This pass introduces a real libp2p protocol-stream request/response path for RepTile:

- Athlete opens `FORM_SAMPLE_PROTOCOL` to Relay.
- Relay reads and validates `form_sample`.
- Relay opens `FORM_SAMPLE_PROTOCOL` to Coach.
- Coach processes and writes `coach_analysis_result` on the same stream.
- Relay reads that result and writes it back on the original athlete stream.

## What Is Real Now

- Protocol IDs are explicit and shared in `shared/protocols.ts`.
- JSON framing over libp2p streams is implemented with a deterministic length-prefixed codec in `shared/reptileStreamCodec.ts`.
- Relay node can coordinate protocol streams between athlete and coach (`relay/libp2p/createRelayNode.ts`).
- Coach node handles protocol requests and returns a schema-valid response (`coach-node/libp2p/createCoachNode.ts`).
- Athlete node dials relay and performs same-stream request/response (`athlete/libp2p/createAthleteNode.ts`).
- Relay lifecycle observations are recorded through `RelayLifecycleRecorder` for key forwarding events.

## What Is Still Mocked

- ViTPose extraction remains mocked/fixture-driven for this pass.
- PerfectRep remains mock-backed when `PERFECTREP_ENABLED=false`.
- UI screens are unchanged and not wired to this new protocol path yet.

## Same-Stream Request/Response

The first smoke path uses a single protocol stream per hop:

1. Athlete -> Relay over `FORM_SAMPLE_PROTOCOL`
2. Relay -> Coach over `FORM_SAMPLE_PROTOCOL`
3. Coach writes response on Relay<->Coach stream
4. Relay writes response on Athlete<->Relay stream

This keeps request correlation simple for Pass A (message IDs still included in payloads).

## Stream Framing Approach

`shared/reptileStreamCodec.ts` uses a length-prefixed frame:

- 4-byte unsigned big-endian payload length
- UTF-8 JSON payload bytes

This prevents relying on transport chunk boundaries and avoids accidental partial-read JSON parsing.

## Why `createMobileNode.js` Stays Separate

`src/node/createMobileNode.js` is existing mobile infrastructure for current app behavior and pubsub flow.
Pass A adds separate protocol-stream node factories for Athlete/Relay/Coach to prove routing foundation without destabilizing existing mobile flow.

## Next Pass

- Add startup scripts/process wiring so relay + coach + athlete protocol nodes are launched together in a repeatable local workflow.
