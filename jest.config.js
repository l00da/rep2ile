module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  /** Allow transforming @react-navigation (ESM) + native stack deps under Jest. */
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-screens|react-native-gesture-handler)/)',
  ],
};
