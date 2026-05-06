import React, {useCallback, useState} from 'react';
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

import {Skeleton3DReplay} from '../components/Skeleton3DReplay';
import type {
  CoachAnalysisResult,
  FormSample,
  RelayObservation,
} from '../../packages/protocol/schemas';
import {
  runRepTileWalkthrough,
  type WalkthroughStepStatus,
} from '../../relay/runRepTileWalkthrough';

const STEP_TITLES = [
  'Athlete Node captures short clip (metadata only)',
  'Athlete Node creates mock IMU payload',
  'Athlete Node extracts fixture / ViTPose-style COCO-17 pose2d keypoints',
  'Athlete Node composes form_sample',
  'Relay observes and forwards packet',
  'Coach Node runs toy analysis (mock lifter)',
  'Coach Node returns coach_analysis_result',
  'Athlete Node displays feedback + skeleton replay',
];

const INITIAL_STEPS: WalkthroughStepStatus[] = Array.from(
  {length: 8},
  () => 'pending',
);

export type DemoWalkthroughScreenProps = {
  /** Lower in tests for speed (default ~90ms between transitions). */
  stepDelayMs?: number;
};

export function DemoWalkthroughScreen({
  stepDelayMs = 90,
}: DemoWalkthroughScreenProps) {
  const isDark = useColorScheme() === 'dark';
  const [stepStatuses, setStepStatuses] =
    useState<WalkthroughStepStatus[]>(INITIAL_STEPS);
  const [busy, setBusy] = useState(false);
  const [formSample, setFormSample] = useState<FormSample | null>(null);
  const [relayObservations, setRelayObservations] = useState<RelayObservation[]>(
    [],
  );
  const [coachAnalysis, setCoachAnalysis] = useState<CoachAnalysisResult | null>(
    null,
  );

  const onRunFullDemo = useCallback(async () => {
    setBusy(true);
    setFormSample(null);
    setRelayObservations([]);
    setCoachAnalysis(null);
    setStepStatuses(Array.from({length: 8}, () => 'pending'));

    try {
      const {formSample: sample, coachAnalysis: analysis, recorder} =
        await runRepTileWalkthrough({
          stepDelayMs,
          onStep: (stepIndex, status) => {
            setStepStatuses(prev => {
              const next = [...prev];
              next[stepIndex] = status;
              return next;
            });
          },
        });
      setFormSample(sample);
      setRelayObservations(recorder.validateAll());
      setCoachAnalysis(analysis);
    } finally {
      setBusy(false);
    }
  }, [stepDelayMs]);

  return (
    <SafeAreaView
      testID="demo-walkthrough-root"
      style={[styles.safe, isDark ? styles.safeDark : styles.safeLight]}
      edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.h1, isDark && styles.textDark]}>
          RepTile P2P Coach walkthrough
        </Text>
        <Text style={[styles.route, isDark && styles.subDark]}>
          Route: /demo — local fixture flow (no real networking).
        </Text>

        <View style={[styles.intro, isDark && styles.introDark]}>
          <Text style={[styles.introP, isDark && styles.textDark]}>
            <Text style={styles.bold}>Athlete Node</Text> — capture + packet
            preparation (clip manifest, IMU, pose2d, form_sample).
          </Text>
          <Text style={[styles.introP, isDark && styles.textDark]}>
            <Text style={styles.bold}>Relay</Text> — observable routing /
            coordinator (message lifecycle only in this build).
          </Text>
          <Text style={[styles.introP, isDark && styles.textDark]}>
            <Text style={styles.bold}>Coach Node</Text> — specialized analysis
            peer (mock lifter now; PerfectRep behind{' '}
            <Text style={styles.mono}>PerfectRep3DLifter</Text> later).
          </Text>
          <Text style={[styles.introP, isDark && styles.textDark]}>
            Real <Text style={styles.bold}>ViTPose</Text> and{' '}
            <Text style={styles.bold}>PerfectRep</Text> ship later behind existing
            adapter boundaries — this demo uses fixtures only.
          </Text>
        </View>

        <View style={styles.runRow}>
          <Button
            title="Run Full Demo"
            onPress={() => {
              void onRunFullDemo();
            }}
            disabled={busy}
            testID="demo-run-full"
          />
          {busy ? <ActivityIndicator style={styles.spinner} /> : null}
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Steps
        </Text>
        {STEP_TITLES.map((title, i) => (
          <View
            key={title}
            style={[styles.stepCard, isDark && styles.stepCardDark]}
            testID={`demo-step-card-${i}`}>
            <View style={styles.stepHeader}>
              <Text style={[styles.stepNum, isDark && styles.textDark]}>
                Step {i + 1}
              </Text>
              <Text
                style={[
                  styles.stepStatus,
                  stepStatuses[i] === 'complete' && styles.statusDone,
                  stepStatuses[i] === 'running' && styles.statusRun,
                  isDark && styles.subDark,
                ]}
                testID={`demo-step-status-${i}`}>
                {stepStatuses[i]}
              </Text>
            </View>
            <Text style={[styles.stepTitle, isDark && styles.textDark]}>
              {title}
            </Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          form_sample preview
        </Text>
        <View style={[styles.jsonBox, isDark && styles.jsonBoxDark]}>
          <Text
            style={[styles.jsonText, isDark && styles.jsonTextDark]}
            selectable
            testID="demo-form-sample-preview">
            {formSample ? JSON.stringify(formSample, null, 2) : '—'}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Relay lifecycle observations
        </Text>
        <View style={[styles.jsonBox, isDark && styles.jsonBoxDark]}>
          <Text
            style={[styles.jsonText, isDark && styles.jsonTextDark]}
            selectable
            testID="demo-relay-observations">
            {relayObservations.length > 0
              ? JSON.stringify(relayObservations, null, 2)
              : '—'}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Coach feedback
        </Text>
        <View style={[styles.feedbackBox, isDark && styles.feedbackBoxDark]}>
          <Text
            style={[styles.feedbackSummary, isDark && styles.textDark]}
            testID="demo-coach-feedback-summary">
            {coachAnalysis?.feedback_summary ?? '—'}
          </Text>
          {(coachAnalysis?.feedback_rules ?? []).map(rule => (
            <Text
              key={rule.rule_id}
              style={[styles.ruleLine, isDark && styles.subDark]}
              testID={`demo-coach-rule-${rule.rule_id}`}>
              [{rule.severity}] {rule.message}
            </Text>
          ))}
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Skeleton replay (mock 3D)
        </Text>
        <Skeleton3DReplay
          sequence={coachAnalysis?.skeleton_3d_sequence ?? null}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  safeLight: {backgroundColor: '#f5f5f7'},
  safeDark: {backgroundColor: '#111'},
  scroll: {padding: 16, paddingBottom: 48},
  h1: {fontSize: 22, fontWeight: '700', marginBottom: 4},
  route: {fontSize: 13, color: '#555', marginBottom: 12},
  subDark: {color: '#aaa'},
  intro: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  introDark: {
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  introP: {fontSize: 14, marginBottom: 8, lineHeight: 20, color: '#222'},
  bold: {fontWeight: '700'},
  mono: {fontFamily: 'Menlo'},
  textDark: {color: '#eee'},
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  spinner: {marginLeft: 8},
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  stepCard: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  stepCardDark: {
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepNum: {fontWeight: '700', fontSize: 13},
  stepStatus: {fontSize: 13, fontWeight: '600', color: '#666'},
  statusRun: {color: '#007aff'},
  statusDone: {color: '#0a7'},
  stepTitle: {fontSize: 14, lineHeight: 20},
  jsonBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    maxHeight: 220,
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
  feedbackBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  feedbackBoxDark: {
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
  },
  feedbackSummary: {fontSize: 15, fontWeight: '600', marginBottom: 8},
  ruleLine: {fontSize: 13, marginBottom: 4, color: '#333'},
});
