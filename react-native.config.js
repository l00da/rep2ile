module.exports = {
  dependencies: {
    // react-native-google-nearby-connection targets SDK 26 / Gradle <7.
    // Skip Android native linking — JS resolves for Metro, native P2P
    // requires a real Android device + a maintained library upgrade anyway.
    'react-native-google-nearby-connection': {
      platforms: { android: null },
    },
  },
};
