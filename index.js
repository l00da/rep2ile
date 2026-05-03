/**
 * @format
 */
import './polyfill-events.js';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Hermes (RN) often lacks Promise.withResolvers — it-queue / libp2p dial-queue need it.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
import { registerGlobals } from 'react-native-webrtc';

global.Buffer = Buffer;

// UTF-8 TextEncoder/TextDecoder — Hermes may omit these; libp2p + multiformats need them.
// require() after Buffer: fast-text-encoding prefers Buffer when present.
require('fast-text-encoding');

registerGlobals();

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
