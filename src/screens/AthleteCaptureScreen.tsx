import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {FixturePose2DExtractor} from '../../athlete-node/vision/vitpose/FixturePose2DExtractor';
import {
  buildClipManifestFromCapture,
  buildFallbackTimerClipManifest,
  buildStaticMockImuPayload,
  composeAthleteFormSample,
  type CaptureTimingMeta,
} from '../athlete/athleteCaptureModel';
import {tryStartBrowserClipCapture} from '../capture/browserClipCapture';
import {
  formSampleSchema,
  type FormSample,
  type MockImuPayload,
  type Pose2DKeypoints,
  type VideoClipManifest,
} from '../../packages/protocol/schemas';

const DEFAULT_SESSION = 'session-athlete-local';
const DEFAULT_SET = 'set-001';
const DEFAULT_EXERCISE = 'squat';
const ATHLETE_NODE_ID = 'athlete-phone';
const FPS_ESTIMATE = 30;

export function AthleteCaptureScreen() {
  const isDark = useColorScheme() === 'dark';

  const [sessionId, setSessionId] = useState(DEFAULT_SESSION);
  const [setId, setSetId] = useState(DEFAULT_SET);
  const [exercise, setExercise] = useState(DEFAULT_EXERCISE);

  const [capturing, setCapturing] = useState(false);
  const captureWallStartMs = useRef<number | null>(null);
  const browserHandleRef = useRef<Awaited<
    ReturnType<typeof tryStartBrowserClipCapture>
  > | null>(null);

  const [lastCapture, setLastCapture] = useState<CaptureTimingMeta | null>(null);
  const [captureHint, setCaptureHint] = useState<string>(
    'Idle — Start begins a session (browser camera if available, else timer).',
  );

  const [clipManifest, setClipManifest] = useState<VideoClipManifest | null>(
    null,
  );
  const [mockImu, setMockImu] = useState<MockImuPayload | null>(null);
  const [pose2d, setPose2d] = useState<Pose2DKeypoints | null>(null);
  const [formSample, setFormSample] = useState<FormSample | null>(null);

  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [busyPose, setBusyPose] = useState(false);

  const resetDerived = useCallback(() => {
    setClipManifest(null);
    setMockImu(null);
    setPose2d(null);
    setFormSample(null);
    setValidationMsg(null);
  }, []);

  const onStartCapture = useCallback(async () => {
    resetDerived();
    captureWallStartMs.current = Date.now();
    setCapturing(true);
    setCaptureHint('Capturing…');

    browserHandleRef.current = await tryStartBrowserClipCapture();
    if (browserHandleRef.current) {
      setCaptureHint('Browser camera active — Stop ends clip metadata.');
    } else {
      setCaptureHint(
        'Camera API unavailable — Stop uses timer duration (mock-friendly).',
      );
    }
  }, [resetDerived]);

  const onStopCapture = useCallback(async () => {
    if (!capturing || captureWallStartMs.current == null) {
      return;
    }
    const startedAt = captureWallStartMs.current;
    const wallNow = Date.now();

    let meta: CaptureTimingMeta;

    if (browserHandleRef.current) {
      const browserResult = await browserHandleRef.current.stop();
      browserHandleRef.current = null;
      if (browserResult && browserResult.durationMs > 0) {
        meta = {
          durationMs: browserResult.durationMs,
          width: browserResult.width,
          height: browserResult.height,
          frameRateFps: FPS_ESTIMATE,
          capturedAtMs: wallNow,
          source: 'browser_camera',
        };
        setCaptureHint(
          `Stopped (browser). Duration ~${browserResult.durationMs} ms.`,
        );
      } else {
        meta = {
          durationMs: Math.max(0, wallNow - startedAt),
          width: 640,
          height: 480,
          frameRateFps: FPS_ESTIMATE,
          capturedAtMs: wallNow,
          source: 'fallback_timer',
        };
        setCaptureHint(
          'Browser capture ended without metrics — using timer fallback.',
        );
      }
    } else {
      meta = {
        durationMs: Math.max(0, wallNow - startedAt),
        width: 640,
        height: 480,
        frameRateFps: FPS_ESTIMATE,
        capturedAtMs: wallNow,
        source: 'fallback_timer',
      };
      setCaptureHint(`Stopped (timer). Duration ${meta.durationMs} ms.`);
    }

    setLastCapture(meta);
    setCapturing(false);
    captureWallStartMs.current = null;
  }, [capturing, resetDerived]);

  const onGenerateClipManifest = useCallback(() => {
    resetDerived();
    const meta =
      lastCapture ??
      ({
        durationMs: 800,
        width: 640,
        height: 480,
        frameRateFps: FPS_ESTIMATE,
        capturedAtMs: Date.now(),
        source: 'fallback_timer',
      } satisfies CaptureTimingMeta);

    const manifest = buildClipManifestFromCapture(meta, {
      sessionId: sessionId.trim() || DEFAULT_SESSION,
      setId: setId.trim() || DEFAULT_SET,
      exercise: exercise.trim() || DEFAULT_EXERCISE,
      athleteNodeId: ATHLETE_NODE_ID,
    });
    setClipManifest(manifest);
    setCaptureHint(
      lastCapture
        ? 'Clip manifest generated from last capture.'
        : 'Clip manifest generated (fallback timer — no capture session).',
    );
  }, [exercise, lastCapture, resetDerived, sessionId, setId]);

  const onGenerateMockImu = useCallback(() => {
    setMockImu(buildStaticMockImuPayload());
  }, []);

  const onGenerateFixturePose2d = useCallback(async () => {
    const manifest =
      clipManifest ??
      buildFallbackTimerClipManifest({
        sessionId: sessionId.trim() || DEFAULT_SESSION,
        setId: setId.trim() || DEFAULT_SET,
        exercise: exercise.trim() || DEFAULT_EXERCISE,
        athleteNodeId: ATHLETE_NODE_ID,
      });

    setBusyPose(true);
    try {
      const extractor = new FixturePose2DExtractor();
      const pose = await extractor.extractFromClip(manifest, {async: true});
      setPose2d(pose);
      if (!clipManifest) {
        setClipManifest(manifest);
      }
    } catch (e) {
      setValidationMsg(
        e instanceof Error ? e.message : 'Fixture pose extraction failed.',
      );
    } finally {
      setBusyPose(false);
    }
  }, [clipManifest, exercise, sessionId, setId]);

  const onComposeFormSample = useCallback(() => {
    const manifest =
      clipManifest ??
      buildFallbackTimerClipManifest({
        sessionId: sessionId.trim() || DEFAULT_SESSION,
        setId: setId.trim() || DEFAULT_SET,
        exercise: exercise.trim() || DEFAULT_EXERCISE,
        athleteNodeId: ATHLETE_NODE_ID,
      });
    const imu = mockImu ?? buildStaticMockImuPayload();

    if (!pose2d) {
      setValidationMsg(
        'Generate Fixture Pose2D first (or run flow in order).',
      );
      return;
    }

    const composed = composeAthleteFormSample({
      manifest,
      mockImu: imu,
      pose2d,
    });
    setFormSample(composed);
    setClipManifest(manifest);
    setMockImu(imu);
    setValidationMsg(null);
  }, [clipManifest, exercise, mockImu, pose2d, sessionId, setId]);

  const onValidateFormSample = useCallback(() => {
    if (!formSample) {
      setValidationMsg('Compose form sample first.');
      return;
    }
    try {
      formSampleSchema.parse(formSample);
      setValidationMsg('OK — Zod validation passed.');
    } catch (e) {
      setValidationMsg(
        e instanceof Error ? e.message : 'Validation failed.',
      );
    }
  }, [formSample]);

  const jsonPreview = formSample
    ? JSON.stringify(formSample, null, 2)
    : '';

  return (
    <SafeAreaView
      testID="athlete-capture-root"
      style={[styles.safe, isDark ? styles.safeDark : styles.safeLight]}
      edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.h1, isDark && styles.textDark]}>
          Athlete capture
        </Text>
        <Text style={[styles.sub, isDark && styles.subDark]}>
          Route: /athlete-capture — metadata-only packets (no upload / no relay).
        </Text>

        <Text style={[styles.label, isDark && styles.textDark]}>session_id</Text>
        <TextInput
          testID="athlete-capture-session-id"
          style={[styles.input, isDark && styles.inputDark]}
          value={sessionId}
          onChangeText={setSessionId}
          autoCapitalize="none"
        />

        <Text style={[styles.label, isDark && styles.textDark]}>set_id</Text>
        <TextInput
          testID="athlete-capture-set-id"
          style={[styles.input, isDark && styles.inputDark]}
          value={setId}
          onChangeText={setSetId}
          autoCapitalize="none"
        />

        <Text style={[styles.label, isDark && styles.textDark]}>exercise</Text>
        <TextInput
          testID="athlete-capture-exercise"
          style={[styles.input, isDark && styles.inputDark]}
          value={exercise}
          onChangeText={setExercise}
          autoCapitalize="none"
        />

        <Text style={[styles.hint, isDark && styles.subDark]}>
          {captureHint}
        </Text>

        <View style={styles.row}>
          <Button
            title="Start Capture"
            onPress={() => {
              void onStartCapture();
            }}
            disabled={capturing}
            testID="athlete-capture-start"
          />
          <Button
            title="Stop Capture"
            onPress={() => {
              void onStopCapture();
            }}
            disabled={!capturing}
            testID="athlete-capture-stop"
          />
        </View>

        <View style={styles.row}>
          <Button
            title="Generate Clip Manifest"
            onPress={onGenerateClipManifest}
            testID="athlete-capture-gen-manifest"
          />
          <Button
            title="Generate Mock IMU Payload"
            onPress={onGenerateMockImu}
            testID="athlete-capture-gen-imu"
          />
        </View>

        <View style={styles.row}>
          <Button
            title="Generate Fixture Pose2D"
            onPress={() => {
              void onGenerateFixturePose2d();
            }}
            testID="athlete-capture-gen-pose2d"
          />
          {busyPose ? (
            <ActivityIndicator testID="athlete-capture-pose-busy" />
          ) : null}
        </View>

        <View style={styles.row}>
          <Button
            title="Compose Form Sample"
            onPress={onComposeFormSample}
            testID="athlete-capture-compose"
          />
          <Button
            title="Validate Form Sample"
            onPress={onValidateFormSample}
            testID="athlete-capture-validate"
          />
        </View>

        <Text style={[styles.label, isDark && styles.textDark]}>
          Validation
        </Text>
        {pose2d ? (
          <Text testID="athlete-capture-pose-ready" style={styles.hiddenMarker}>
            pose_ready
          </Text>
        ) : null}
        <Text
          testID="athlete-capture-validation-status"
          style={[styles.validation, isDark && styles.textDark]}>
          {validationMsg ?? '—'}
        </Text>

        <Text style={[styles.label, isDark && styles.textDark]}>
          Packet preview (JSON — metadata only)
        </Text>
        <View style={[styles.jsonBox, isDark && styles.jsonBoxDark]}>
          <Text
            testID="athlete-capture-json-preview"
            style={[styles.jsonText, isDark && styles.jsonTextDark]}
            selectable>
            {jsonPreview || '{}'}
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
  scroll: {padding: 16, paddingBottom: 40},
  h1: {fontSize: 22, fontWeight: '700', marginBottom: 4},
  sub: {fontSize: 13, color: '#555', marginBottom: 12},
  subDark: {color: '#aaa'},
  hint: {fontSize: 13, marginBottom: 12},
  label: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  textDark: {color: '#eee'},
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  validation: {fontSize: 14, marginTop: 6},
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
  hiddenMarker: {height: 1, opacity: 0, overflow: 'hidden'},
});
