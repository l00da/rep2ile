/**
 * PeerToPeer — libp2p mobile shell + navigation (Relay debug at /relay-debug).
 *
 * @format
 */
import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {linking} from './src/navigation/linking';
import type {RootStackParamList} from './src/navigation/types';
import {AthleteCaptureScreen} from './src/screens/AthleteCaptureScreen';
import {DemoWalkthroughScreen} from './src/screens/DemoWalkthroughScreen';
import {HomeScreen} from './src/screens/HomeScreen';
import {RelayDebugScreen} from './src/screens/RelayDebugScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{title: 'PeerToPeer'}}
          />
          <Stack.Screen
            name="RelayDebug"
            component={RelayDebugScreen}
            options={{title: 'Relay debug'}}
          />
          <Stack.Screen
            name="AthleteCapture"
            component={AthleteCaptureScreen}
            options={{title: 'Athlete capture'}}
          />
          <Stack.Screen
            name="DemoWalkthrough"
            component={DemoWalkthroughScreen}
            options={{title: 'RepTile demo'}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
