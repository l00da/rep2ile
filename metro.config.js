const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * libp2p pulls optional Node core modules; stub them for React Native.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest(context, moduleName, platform) {
      // Metro + package "exports" can yield broken named exports for some ESM-only packages
      // (e.g. undefined `trackedMap` from `@libp2p/utils`). Pin entries to `dist/src/index.js`.
      if (moduleName === '@libp2p/circuit-relay-v2') {
        return {
          filePath: path.resolve(
            __dirname,
            'node_modules/@libp2p/circuit-relay-v2/dist/src/index.js',
          ),
          type: 'sourceFile',
        };
      }
      if (moduleName === '@libp2p/mplex') {
        return {
          filePath: path.resolve(
            __dirname,
            'node_modules/@libp2p/mplex/dist/src/index.js',
          ),
          type: 'sourceFile',
        };
      }
      if (moduleName === '@libp2p/utils') {
        return {
          filePath: path.resolve(
            __dirname,
            'node_modules/@libp2p/utils/dist/src/index.js',
          ),
          type: 'sourceFile',
        };
      }
      if (moduleName === 'p-defer') {
        return {
          filePath: path.resolve(__dirname, 'shims/p-defer.js'),
          type: 'sourceFile',
        };
      }
      const stubs = {
        'node:os': path.resolve(__dirname, 'shims/node-os.js'),
        os: path.resolve(__dirname, 'shims/node-os.js'),
        'node:net': path.resolve(__dirname, 'shims/empty.js'),
        net: path.resolve(__dirname, 'shims/empty.js'),
        'node:dgram': path.resolve(__dirname, 'shims/empty.js'),
        dgram: path.resolve(__dirname, 'shims/empty.js'),
        'node:dns': path.resolve(__dirname, 'shims/empty.js'),
        dns: path.resolve(__dirname, 'shims/empty.js'),
        'node:tls': path.resolve(__dirname, 'shims/empty.js'),
        tls: path.resolve(__dirname, 'shims/empty.js'),
        'node:http': path.resolve(__dirname, 'shims/empty.js'),
        http: path.resolve(__dirname, 'shims/empty.js'),
        'node:https': path.resolve(__dirname, 'shims/empty.js'),
        https: path.resolve(__dirname, 'shims/empty.js'),
        'node:fs': path.resolve(__dirname, 'shims/empty.js'),
        fs: path.resolve(__dirname, 'shims/empty.js'),
        'node:child_process': path.resolve(__dirname, 'shims/empty.js'),
        child_process: path.resolve(__dirname, 'shims/empty.js'),
      };
      const hit = stubs[moduleName];
      if (hit != null) {
        return {
          filePath: hit,
          type: 'sourceFile',
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
