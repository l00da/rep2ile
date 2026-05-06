import type {LinkingOptions} from '@react-navigation/native';
import type {RootStackParamList} from './types';

/** Deep link path `/relay-debug` → RelayDebug screen. */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['peer-to-peer://', 'https://localhost'],
  config: {
    screens: {
      Home: '',
      RelayDebug: 'relay-debug',
      AthleteCapture: 'athlete-capture',
      DemoWalkthrough: 'demo',
    },
  },
};
