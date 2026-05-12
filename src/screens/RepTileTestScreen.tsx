/**
 * RepTileTestScreen — manual two-device integration test UI.
 *
 * Usage: Both iPhones run this screen.
 *   1. Tap "Generate Identity" on each phone.
 *   2. Tap "Start Broadcast" on each phone.
 *   3. Wait ~2 s for nearby peers to appear.
 *   4. On one phone, tap "Challenge" next to the other phone's entry.
 *   5. Connection forms automatically; tap "Send Rep" to exchange events.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Button,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  useColorScheme,
} from 'react-native';

import { ghostIdentity } from '../identity/GhostIdentity';
import { resonanceEngine } from '../p2p/ResonanceEngine';
import type { RepEvent } from '../p2p/PayloadValidator';
import type { ChallengeCallback, StateCode } from '../p2p/ResonanceEngine';

interface PeerEntry {
  endpointId: string;
  tempID: string;
}

export function RepTileTestScreen() {
  const isDark = useColorScheme() === 'dark';

  const [tempID, setTempID] = useState<string | null>(ghostIdentity.getTempID());
  const [engineState, setEngineState] = useState(resonanceEngine.getEngineState());
  const [nearbyPeers, setNearbyPeers] = useState<PeerEntry[]>([]);
  const [arenaPeers, setArenaPeers] = useState<PeerEntry[]>([]);
  const [peerStates, setPeerStates] = useState<Map<string, StateCode>>(new Map());
  const [repsSent, setRepsSent] = useState(0);
  const [repsReceived, setRepsReceived] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  // ---- identity ----

  const handleGenerate = useCallback(() => {
    ghostIdentity.generate();
    const id = ghostIdentity.getTempID();
    setTempID(id);
    appendLog(`Identity generated: ${id?.slice(0, 8)}…`);
  }, [appendLog]);

  const handleBurn = useCallback(async () => {
    if (resonanceEngine.getEngineState() !== 'stopped') {
      await resonanceEngine.stopAllEndpoints();
      setEngineState('stopped');
      setNearbyPeers([]);
      setArenaPeers([]);
    }
    ghostIdentity.burn();
    setTempID(null);
    appendLog('Identity burned.');
  }, [appendLog]);

  // ---- challenge consent ----

  const handleChallengeReceived = useCallback<ChallengeCallback>(
    (endpointId, tempID, respond) => {
      appendLog(`Challenge from ${tempID.slice(0, 8)}…`);
      Alert.alert(
        'Challenge received',
        `${tempID.slice(0, 13)}… wants to enter the arena.`,
        [
          {
            text: 'Reject',
            style: 'destructive',
            onPress: () => {
              appendLog(`Rejected challenge from ${tempID.slice(0, 8)}`);
              respond(false);
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              appendLog(`Accepted challenge from ${tempID.slice(0, 8)}`);
              respond(true);
            },
          },
        ],
      );
    },
    [appendLog],
  );

  // ---- broadcast ----

  const handleStart = useCallback(async () => {
    if (!ghostIdentity.isActive()) {
      appendLog('ERROR: Generate identity first.');
      return;
    }
    try {
      await resonanceEngine.startAmbientBroadcast(
        // onPeersChanged
        (_peers) => {
          const entries = Array.from(
            resonanceEngine.getNearbyEndpoints().entries(),
          ).map(([eid, tid]) => ({ endpointId: eid, tempID: tid }));
          setNearbyPeers(entries);
          setPeerStates(new Map(resonanceEngine.getPeerStateMap()));
        },
        // onRepReceived
        (event: RepEvent, fromEndpointId: string) => {
          setRepsReceived((n) => n + 1);
          appendLog(`Rep received from ${fromEndpointId.slice(0, 6)}`);
        },
        // onArenaChanged
        (arena) => {
          const entries = Array.from(arena.entries()).map(([eid, tid]) => ({
            endpointId: eid,
            tempID: tid,
          }));
          setArenaPeers(entries);
          setEngineState(resonanceEngine.getEngineState());
          // Force-sync peerStateMap so the nearby list reflects arena status immediately
          // without waiting for the next BLE foundPeer event.
          setPeerStates(new Map(resonanceEngine.getPeerStateMap()));
        },
        // onChallengeReceived
        handleChallengeReceived,
      );
      setEngineState(resonanceEngine.getEngineState());
      appendLog('Broadcast started — advertising + scanning.');
    } catch (e) {
      appendLog(`Start error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [appendLog]);

  const handleStop = useCallback(async () => {
    try {
      await resonanceEngine.stopAllEndpoints();
    } finally {
      setEngineState('stopped');
      setNearbyPeers([]);
      setArenaPeers([]);
      setPeerStates(new Map());
      appendLog('Stopped.');
    }
  }, [appendLog, handleChallengeReceived]);

  // ---- end arena ----

  const handleEndArena = useCallback(async () => {
    try {
      await resonanceEngine.endArena();
      setEngineState(resonanceEngine.getEngineState());
      setArenaPeers([]);
      appendLog('Arena ended — returned to ambient.');
    } catch (e) {
      appendLog(`End arena error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [appendLog]);

  // ---- challenge ----

  const handleChallenge = useCallback(
    async (endpointId: string, peerTempID: string) => {
      try {
        appendLog(`Challenging ${peerTempID.slice(0, 8)}…`);
        await resonanceEngine.initiateChallenge(endpointId);
        setEngineState(resonanceEngine.getEngineState());
        appendLog('Challenge sent — awaiting connection.');
      } catch (e) {
        appendLog(`Challenge error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [appendLog],
  );

  // ---- rep ----

  const handleSendRep = useCallback(
    async (endpointId: string) => {
      try {
        await resonanceEngine.sendRepEvent(endpointId);
        setRepsSent((n) => n + 1);
        appendLog(`Rep sent to ${endpointId.slice(0, 6)}`);
      } catch (e) {
        appendLog(`Rep error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [appendLog],
  );

  // ---- render ----

  const stateColor =
    engineState === 'ambient'
      ? '#34c759'
      : engineState === 'seeking'
        ? '#ff9500'
        : '#8e8e93';

  const T = isDark ? styles.dark : styles.light;

  return (
    <View style={[styles.container, isDark ? styles.bgDark : styles.bgLight]}>
      {/* Identity */}
      <SectionHeader label="Identity" isDark={isDark} />
      <View style={styles.row}>
        <Button title="Generate" onPress={handleGenerate} />
        <Button title="Burn" onPress={handleBurn} color="#c00" />
      </View>
      <Text style={[styles.mono, T]} numberOfLines={1}>
        {tempID ?? '— no identity —'}
      </Text>

      {/* Engine */}
      <SectionHeader label="Engine" isDark={isDark} />
      <View style={styles.row}>
        <Button title="Start Broadcast" onPress={handleStart} />
        <Button title="Stop" onPress={handleStop} color="#c00" />
      </View>
      <Text style={[styles.stateBadge, { color: stateColor }]}>
        ● {engineState}
      </Text>

      {/* Nearby peers */}
      <SectionHeader
        label={`Nearby Peers (${nearbyPeers.length})`}
        isDark={isDark}
      />
      {nearbyPeers.length === 0 ? (
        <Text style={[styles.hint, T]}>None found yet…</Text>
      ) : (
        nearbyPeers.map((p) => {
          const inArena =
            arenaPeers.some((a) => a.endpointId === p.endpointId) ||
            peerStates.get(p.endpointId) === '2';
          return (
            <View key={p.endpointId} style={styles.peerRow}>
              <Text style={[styles.mono, styles.peerID, T]} numberOfLines={1}>
                {p.tempID.slice(0, 13)}…
              </Text>
              {inArena ? (
                <View style={styles.inArenaTag}>
                  <Text style={styles.inArenaLabel}>In Arena</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.challengeBtn}
                  onPress={() => handleChallenge(p.endpointId, p.tempID)}>
                  <Text style={styles.challengeLabel}>Challenge</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}

      {/* Arena peers */}
      <SectionHeader
        label={`Arena / Connected (${arenaPeers.length})`}
        isDark={isDark}
      />
      {arenaPeers.length === 0 ? (
        <Text style={[styles.hint, T]}>No active arena connections.</Text>
      ) : (
        arenaPeers.map((p) => (
          <View key={p.endpointId} style={styles.peerRow}>
            <Text style={[styles.mono, styles.peerID, T]} numberOfLines={1}>
              {p.tempID.slice(0, 13)}…
            </Text>
            <TouchableOpacity
              style={styles.repBtn}
              onPress={() => handleSendRep(p.endpointId)}>
              <Text style={styles.repLabel}>Send Rep ▲</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endArenaBtn}
              onPress={handleEndArena}>
              <Text style={styles.endArenaLabel}>End</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Counters */}
      <View style={styles.counters}>
        <Text style={[styles.counter, T]}>↑ Sent: {repsSent}</Text>
        <Text style={[styles.counter, T]}>↓ Received: {repsReceived}</Text>
      </View>

      {/* Log */}
      <SectionHeader label="Log" isDark={isDark} />
      <ScrollView style={[styles.log, isDark ? styles.logDark : styles.logLight]}>
        {log.map((line, i) => (
          <Text key={i} style={[styles.logLine, T]}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <Text style={[styles.sectionHeader, isDark ? styles.dark : styles.light]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14 },
  bgLight: { backgroundColor: '#f5f5f7' },
  bgDark: { backgroundColor: '#111' },
  light: { color: '#111' },
  dark: { color: '#eee' },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#888',
  },
  mono: { fontFamily: 'Menlo', fontSize: 11 },
  stateBadge: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  hint: { fontSize: 12, color: '#aaa', marginBottom: 4 },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  peerID: { flex: 1 },
  challengeBtn: {
    backgroundColor: '#ff9500',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  challengeLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  repBtn: {
    backgroundColor: '#34c759',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  repLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  endArenaBtn: {
    backgroundColor: '#c00',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  endArenaLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  inArenaTag: {
    backgroundColor: '#8e8e93',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  inArenaLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  counters: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  counter: { fontSize: 14, fontWeight: '600' },
  log: {
    flex: 1,
    marginTop: 4,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  logLight: { backgroundColor: '#fff' },
  logDark: { backgroundColor: '#1a1a1a', borderColor: '#444' },
  logLine: { fontSize: 11, fontFamily: 'Menlo', marginBottom: 4 },
});
