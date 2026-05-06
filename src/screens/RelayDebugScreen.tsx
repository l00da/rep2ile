import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import type {RelayObservation} from '../../packages/protocol/schemas';
import {RelayLifecycleRecorder} from '../../relay/RelayLifecycleRecorder';
import {runFixtureRelayDemo} from '../../relay/runFixtureRelayDemo';

function FieldRow({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, isDark && styles.textDark]}>{label}</Text>
      <Text
        style={[styles.fieldValue, isDark && styles.textDark]}
        selectable>
        {value}
      </Text>
    </View>
  );
}

export function RelayDebugScreen() {
  const isDark = useColorScheme() === 'dark';
  const [observations, setObservations] = useState<RelayObservation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expectedOrder = useMemo(
    () => RelayLifecycleRecorder.expectedEventOrder(),
    [],
  );

  const jsonPanel = useMemo(
    () => JSON.stringify(observations, null, 2),
    [observations],
  );

  const runFixtureDemoFlow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const {recorder} = await runFixtureRelayDemo();
      setObservations(recorder.validateAll());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView
      testID="relay-debug-root"
      style={[styles.safe, isDark ? styles.safeDark : styles.safeLight]}
      edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.h1, isDark && styles.textDark]}>Relay debug</Text>
        <Text style={[styles.sub, isDark && styles.subDark]}>
          Route: /relay-debug — fixture-driven lifecycle (no live networking).
        </Text>

        <View style={styles.buttonRow}>
          <Button
            title="Run Fixture Demo Flow"
            onPress={() => {
              void runFixtureDemoFlow();
            }}
            disabled={busy}
            testID="relay-debug-run-demo"
          />
          {busy ? <ActivityIndicator style={styles.spinner} /> : null}
        </View>

        {error ? (
          <Text style={styles.error} testID="relay-debug-error">
            {error}
          </Text>
        ) : null}

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Expected lifecycle order
        </Text>
        <View style={[styles.orderBox, isDark && styles.orderBoxDark]}>
          {expectedOrder.map((kind, i) => (
            <Text
              key={kind}
              style={[styles.orderLine, isDark && styles.textDark]}
              testID={`relay-debug-expected-${i}`}>
              {i + 1}. {kind}
            </Text>
          ))}
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Latest relay observations ({observations.length})
        </Text>

        {observations.length === 0 ? (
          <Text style={[styles.empty, isDark && styles.subDark]}>
            Tap “Run Fixture Demo Flow” to record observations.
          </Text>
        ) : (
          observations.map((o, index) => (
            <View
              key={o.observation_id}
              style={[styles.card, isDark && styles.cardDark]}
              testID={`relay-debug-step-${index}`}>
              <Text style={[styles.cardTitle, isDark && styles.textDark]}>
                {index + 1}. {o.event_kind}
              </Text>
              <FieldRow label="message_id" value={o.message_id} isDark={isDark} />
              <FieldRow label="session_id" value={o.session_id} isDark={isDark} />
              <FieldRow
                label="source_message_id"
                value={o.source_message_id ?? '—'}
                isDark={isDark}
              />
              <FieldRow
                label="sender_node_id"
                value={o.sender_node_id}
                isDark={isDark}
              />
              <FieldRow
                label="receiver_node_id"
                value={o.receiver_node_id}
                isDark={isDark}
              />
              <FieldRow
                label="message_type"
                value={o.message_type}
                isDark={isDark}
              />
              <FieldRow label="status" value={o.status} isDark={isDark} />
              <FieldRow
                label="created_at_ms"
                value={String(o.created_at_ms)}
                isDark={isDark}
              />
              <FieldRow
                label="received_at_ms"
                value={
                  o.received_at_ms != null ? String(o.received_at_ms) : '—'
                }
                isDark={isDark}
              />
              <FieldRow
                label="forwarded_at_ms"
                value={
                  o.forwarded_at_ms != null ? String(o.forwarded_at_ms) : '—'
                }
                isDark={isDark}
              />
              <Text style={[styles.previewLabel, isDark && styles.textDark]}>
                payload_preview (summarized)
              </Text>
              <Text
                style={[styles.previewBody, isDark && styles.previewBodyDark]}
                selectable
                testID={`relay-debug-payload-preview-${index}`}>
                {o.payload_preview}
              </Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          JSON (full observations)
        </Text>
        <View style={[styles.jsonBox, isDark && styles.jsonBoxDark]}>
          <Text
            style={[styles.jsonText, isDark && styles.jsonTextDark]}
            selectable
            testID="relay-debug-json-panel">
            {jsonPanel}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  safeLight: {backgroundColor: '#f5f5f7'},
  safeDark: {backgroundColor: '#111'},
  scrollContent: {padding: 16, paddingBottom: 32},
  h1: {fontSize: 22, fontWeight: '700', marginBottom: 4},
  sub: {fontSize: 13, color: '#555', marginBottom: 12},
  subDark: {color: '#aaa'},
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  spinner: {marginLeft: 8},
  error: {color: '#c00', marginBottom: 8},
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  textDark: {color: '#eee'},
  orderBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  orderBoxDark: {
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  orderLine: {fontSize: 13, marginBottom: 4},
  empty: {fontSize: 14, color: '#666'},
  card: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardDark: {
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  cardTitle: {fontWeight: '700', marginBottom: 8},
  fieldRow: {marginBottom: 6},
  fieldLabel: {fontSize: 11, fontWeight: '600', color: '#666'},
  fieldValue: {fontSize: 13, color: '#222'},
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  previewBody: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#222',
    lineHeight: 16,
  },
  previewBodyDark: {color: '#ddd'},
  jsonBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    maxHeight: 280,
  },
  jsonBoxDark: {
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  jsonText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: '#222',
  },
  jsonTextDark: {color: '#ddd'},
});
