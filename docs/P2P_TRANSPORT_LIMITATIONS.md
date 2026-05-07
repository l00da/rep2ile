# P2P Transport Limitations (Current Test Harness)

This repository now contains real libp2p node factories for Athlete/Relay/Coach, but the default Jest environment in this project currently cannot execute the libp2p ESM transport stack directly (`@chainsafe/libp2p-noise` and related runtime modules do not resolve under the existing Jest resolver/transforms).

## What Is Proven In Tests

- Length-prefixed stream framing and JSON codec behavior.
- Relay routing logic over protocol streams using in-process duplex stream adapters.
- End-to-end message semantics:
  - `form_sample` ingress
  - relay forward-to-coach
  - coach result return
  - relay forward-to-athlete
- Relay observation events are recorded for the required stages.

## What Is Not Yet Proven By Automated Tests

- Real socket transport behavior (WebSockets/WebRTC/circuit relay) under the current Jest runner.
- Real multiaddr dialing/listening from the new libp2p factories as part of `npm test`.

## Next Validation Step

- Add a Node-native smoke harness (outside the current RN Jest runtime) to launch `createRelayNode`, `createCoachNode`, and `createAthleteNode` and verify live socket routing with real libp2p transports.
