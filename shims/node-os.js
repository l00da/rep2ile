/** Minimal stub for `node:os` — libp2p calls `networkInterfaces()` on some paths. */
module.exports = {
  networkInterfaces() {
    return {};
  },
  hostname() {
    return 'react-native';
  },
  platform() {
    return 'ios';
  },
};
