# P2P Separate-Process Smoke Test

This pass validates the protocol path with three real processes:

- Terminal 1: relay node process
- Terminal 2: coach node process
- Terminal 3: athlete smoke sender process

## Node Version

This stack is validated on Node 20/22 LTS. If you are on Node 25 and see module export/import resolver errors (for example around `@chainsafe/libp2p-noise`), switch to LTS first:

```bash
nvm use 22
```

or

```bash
nvm use 20
```

## What This Proves

- Existing libp2p node factories boot in separate processes.
- Athlete can dial relay and send `form_sample` over protocol stream.
- Relay can forward to coach over protocol stream and return response.
- Coach can parse request and return `coach_analysis_result`.
- Same-stream request/response behavior works in a live runtime (outside adapter tests).

## What This Does Not Prove

- Mobile UI integration (`AthleteCaptureScreen`) is still unwired for this flow.
- Real ViTPose or real PerfectRep inference is still not part of this pass.
- Cross-network/NAT traversal reliability across arbitrary networks.

## Commands

### Terminal 1 (Relay)

```bash
npm run p2p:relay
```

Expected logs include relay peer id and listen multiaddrs.
Copy one relay multiaddr and append `/p2p/<relayPeerId>` if not already present.

### Terminal 2 (Coach)

```bash
RELAY_MULTIADDR="<relay-multiaddr-with-/p2p/peerId>" npm run p2p:coach
```

Expected logs:

- coach peer id
- connected relay multiaddr
- `received form_sample ...` when athlete sends
- `returned coach_analysis_result ...` after response

### Terminal 3 (Athlete Smoke Sender)

```bash
RELAY_MULTIADDR="<relay-multiaddr-with-/p2p/peerId>" npm run p2p:athlete-smoke
```

Expected logs:

- sent `form_sample` message id
- returned result line with `source`, derived `score`, and `frame_count`

Exit code should be `0` on success, nonzero on timeout/failure.

## Troubleshooting

- **WebSockets address format**
  - Ensure relay address includes `/ws` and `/p2p/<relayPeerId>`.
- **LAN IP hint**
  - Relay prints a LAN-friendly hint replacing `0.0.0.0` with detected local IPv4.
  - For another laptop/phone on same network, use the hinted LAN address.
- **Firewall**
  - Allow inbound TCP on relay port (default `15001`) for LAN tests.
- **Relay multiaddr mismatch**
  - Coach and athlete must use the same relay peer id suffix.
  - If relay restarts, refresh peer id and relay multiaddr in both env vars.
- **Timeouts from athlete smoke**
  - Confirm coach process is running and connected before sending athlete smoke.
