/**
 * Main shell — libp2p mobile demo (unchanged behavior vs single-screen App).
 */
import React, {useCallback, useRef, useState} from 'react';
import {
  Alert,
  Button,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {createMobileNode} from '../node/createMobileNode.js';
import type {RootStackParamList} from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type ConnStatus = 'idle' | 'connecting' | 'online' | 'error';

type Role = 'athlete' | 'coach' | 'nutrition';

const DEFAULT_AUTH_TOKEN = 'p2p-demo-alpha';

export function HomeScreen({navigation}: Props) {
  const isDark = useColorScheme() === 'dark';

  const [role, setRole] = useState<Role>('athlete');
  const [authToken, setAuthToken] = useState(DEFAULT_AUTH_TOKEN);
  const [bootstrapAddr, setBootstrapAddr] = useState('');
  const [peerId, setPeerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [lines, setLines] = useState<string[]>([]);

  const controllerRef = useRef<ReturnType<typeof createMobileNode> | null>(
    null,
  );

  const appendLog = useCallback((line: string) => {
    const stamp = new Date().toISOString().slice(11, 23);
    setLines(prev => [`[${stamp}] ${line}`, ...prev].slice(0, 200));
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await controllerRef.current?.stop();
    } finally {
      controllerRef.current = null;
      setPeerId(null);
    }
  }, []);

  const handleStart = useCallback(async () => {
    await handleStop();
    setLines([]);
    appendLog('Starting libp2p (deferred via InteractionManager)...');

    const ctrl = createMobileNode({
      role,
      authToken,
      bootstrapAddr: bootstrapAddr.trim() || undefined,
      onStatus: s => setStatus(s),
      onMessage: msg => appendLog(`msg: ${JSON.stringify(msg)}`),
      onLog: appendLog,
    });
    controllerRef.current = ctrl;

    try {
      await ctrl.start();
      setPeerId(ctrl.getPeerId());
    } catch (e) {
      const detail =
        e instanceof Error
          ? `${e.message}${e.stack != null ? `\n${e.stack}` : ''}`
          : String(e);
      appendLog(`start error: ${detail}`);
      setStatus('error');
      controllerRef.current = null;
    }
  }, [role, authToken, bootstrapAddr, appendLog, handleStop]);

  const onPublish = async () => {
    try {
      await controllerRef.current?.publishWorkoutSummary({
        user: 'mobile-athlete',
        exercise: 'squat',
        reps: 10,
      });
    } catch (e) {
      appendLog(`publish error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const shareLogs = useCallback(async () => {
    if (lines.length === 0) {
      Alert.alert('Log empty', 'Run Start node or reproduce the issue first.');
      return;
    }
    const chronological = [...lines].reverse().join('\n');
    const payload = `PeerToPeer log\nstatus=${status}\npeerId=${peerId ?? '—'}\n---\n${chronological}`;
    try {
      await Share.share({message: payload});
    } catch {
      /* dismissed */
    }
  }, [lines, peerId, status]);

  const statusLabel =
    status === 'idle'
      ? 'Idle'
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'online'
          ? 'Online'
          : 'Error';

  return (
    <SafeAreaView
      style={[styles.safe, isDark ? styles.safeDark : styles.safeLight]}
      edges={['left', 'right', 'bottom']}>
      <View style={styles.navRelayRow}>
        <Text style={[styles.label, isDark && styles.textDark]}>
          Debug routes — no live relay send yet.
        </Text>
        <Button
          title="Relay debug"
          onPress={() => navigation.navigate('RelayDebug')}
          accessibilityLabel="Open relay debug route relay-debug"
        />
        <Button
          title="Athlete capture"
          onPress={() => navigation.navigate('AthleteCapture')}
          accessibilityLabel="Open athlete capture route athlete-capture"
        />
        <Button
          title="RepTile demo"
          onPress={() => navigation.navigate('DemoWalkthrough')}
          accessibilityLabel="Open full walkthrough route demo"
        />
      </View>

      <Text style={[styles.label, isDark && styles.textDark]}>Role</Text>
      <View style={styles.row}>
        {(['athlete', 'coach', 'nutrition'] as const).map(r => (
          <Button
            key={r}
            title={r}
            onPress={() => setRole(r)}
            color={role === r ? '#007aff' : '#888'}
          />
        ))}
      </View>

      <Text style={[styles.label, isDark && styles.textDark]}>AUTH_TOKEN</Text>
      <TextInput
        style={[styles.input, isDark && styles.inputDark]}
        value={authToken}
        onChangeText={setAuthToken}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.label, isDark && styles.textDark]}>
        BOOTSTRAP_ADDR (optional — WebSocket multiaddr reachable from device)
      </Text>
      <TextInput
        style={[styles.input, styles.mono, isDark && styles.inputDark]}
        value={bootstrapAddr}
        onChangeText={setBootstrapAddr}
        placeholder="/dns4/…/tcp/443/tls/wss/ws/p2p/…"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.row}>
        <Button title="Start node" onPress={handleStart} />
        <Button title="Stop node" onPress={handleStop} color="#c00" />
      </View>

      <Text style={[styles.label, isDark && styles.textDark]}>PeerID</Text>
      <Text style={[styles.mono, isDark && styles.textDark]} selectable>
        {peerId ?? '—'}
      </Text>

      <Text style={[styles.label, isDark && styles.textDark]}>Status</Text>
      <Text style={[styles.status, isDark && styles.textDark]}>
        {statusLabel}
      </Text>

      {role === 'athlete' && status === 'online' && (
        <View style={styles.publishWrap}>
          <Button title="Publish summary" onPress={onPublish} />
        </View>
      )}

      <View style={styles.logHeader}>
        <Text style={[styles.label, styles.logTitle, isDark && styles.textDark]}>
          Log (workout-summaries + diagnostics)
        </Text>
        <Button title="Share log" onPress={shareLogs} />
      </View>
      <ScrollView style={styles.log}>
        {lines.map((line, i) => (
          <Text
            key={`${i}-${line.slice(0, 24)}`}
            style={[styles.logLine, isDark && styles.textDark]}
            selectable>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, padding: 16},
  safeLight: {backgroundColor: '#f5f5f7'},
  safeDark: {backgroundColor: '#111'},
  navRelayRow: {marginBottom: 12, gap: 8},
  label: {marginTop: 10, fontSize: 13, fontWeight: '500', color: '#333'},
  textDark: {color: '#eee'},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    backgroundColor: '#fff',
  },
  inputDark: {
    borderColor: '#444',
    backgroundColor: '#222',
    color: '#fff',
  },
  mono: {fontFamily: 'Menlo'},
  status: {fontSize: 18, fontWeight: '600', marginTop: 4},
  publishWrap: {marginVertical: 12},
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  logTitle: {flex: 1, marginTop: 0},
  log: {
    flex: 1,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fff',
  },
  logLine: {fontSize: 12, marginBottom: 6, color: '#222'},
});
