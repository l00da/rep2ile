# PeerToPeer

React Native app that runs a minimal **[libp2p](https://libp2p.io)** node on device (WebSockets, WebRTC, circuit relay, Gossipsub). Use it as a shell to dial a bootstrap peer and exercise pubsub-style flows.

## Prerequisites

Complete the official [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) for your OS (Xcode and CocoaPods for iOS, Android SDK for Android).

- **Node.js** (LTS)
- **iOS:** Xcode, `bundle install` and `bundle exec pod install` under `ios/` when native deps change

## Getting started

### 1. Install

From the project root:

```sh
npm install
```

`postinstall` runs **patch-package** and applies `patches/*.patch` (Hermes / Metro compatibility fixes for libp2p and related packages). Do not delete the `patches` directory.

### 2. Start Metro

```sh
npm start
```

After changing shims, Metro config, or patches, use a clean cache:

```sh
npx react-native start --reset-cache
```

### 3. Run the app

In another terminal (with Metro still running):

```sh
# iOS Simulator or device
npm run ios

# Android
npm run android
```

For a physical iPhone, use Xcode or `npx react-native run-ios --device` with signing configured.

## Using the app

1. Set **auth token** (allowed values in code: e.g. `p2p-demo-alpha`, `p2p-demo-beta`).
2. Choose **role** (athlete / coach / nutrition).
3. Optionally paste a **bootstrap** multiaddr (e.g. `/dns4/.../tcp/443/tls/wss/p2p/...`) to dial after the node starts.
4. Tap **Start node**. On success, the log shows a **PeerID** and status **online**; you can **Share log** for debugging.

## Project layout (short)

| Path | Role |
|------|------|
| `App.tsx` | UI, start/stop, log share |
| `src/node/createMobileNode.js` | libp2p creation, gossipsub, bootstrap dial |
| `index.js`, `polyfill-events.js` | Globals / polyfills before libp2p loads |
| `metro.config.js` | Resolver stubs and package pins for RN |
| `patches/` | `patch-package` diffs applied on `npm install` |

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Stale JS after edits | Reload the app; restart Metro with `--reset-cache` |
| Metro / port conflicts | Stop other Metro processes; free port `8081` if needed |
| iOS pods | `cd ios && bundle exec pod install` |

For general React Native problems, see the [RN troubleshooting guide](https://reactnative.dev/docs/troubleshooting).

## License

Private / project default unless otherwise specified.
