import {FixturePose2DExtractor} from '../athlete-node/vision/vitpose/FixturePose2DExtractor';
import {
  buildFallbackTimerClipManifest,
  buildStaticMockImuPayload,
  composeAthleteFormSample,
} from '../src/athlete/athleteCaptureModel';
import {
  formSampleSchema,
  mockImuPayloadSchema,
  videoClipManifestSchema,
} from '../packages/protocol/schemas';

describe('athleteCaptureModel (Pass 9)', () => {
  it('fallback mock clip manifest validates', () => {
    const m = buildFallbackTimerClipManifest({
      sessionId: 'session-test',
      setId: 'set-test',
      exercise: 'squat',
      athleteNodeId: 'athlete-test',
      durationMs: 900,
    });
    expect(() => videoClipManifestSchema.parse(m)).not.toThrow();
    expect(m.file_uri.startsWith('placeholder://')).toBe(true);
    expect(m.clip_uri).toBe(m.file_uri);
    expect(m.frame_count).toBeDefined();
    expect(m.captured_at_ms).toBeDefined();
  });

  it('static mock IMU payload validates', () => {
    const imu = buildStaticMockImuPayload();
    expect(() => mockImuPayloadSchema.parse(imu)).not.toThrow();
    expect(imu.peak_velocity_mps).toBeDefined();
  });

  it('fixture pose2d validates with ManifestPose2DExtractor', async () => {
    const manifest = buildFallbackTimerClipManifest({
      sessionId: 'session-test',
      setId: 'set-test',
      exercise: 'squat',
      athleteNodeId: 'athlete-test',
    });
    const extractor = new FixturePose2DExtractor();
    const pose = await extractor.extractFromClip(manifest);
    expect(pose.frames.length).toBeGreaterThan(0);
  });

  it('composed form_sample validates', async () => {
    const manifest = buildFallbackTimerClipManifest({
      sessionId: 'session-test',
      setId: 'set-test',
      exercise: 'squat',
      athleteNodeId: 'athlete-test',
    });
    const imu = buildStaticMockImuPayload();
    const extractor = new FixturePose2DExtractor();
    const pose = await extractor.extractFromClip(manifest);
    const sample = composeAthleteFormSample({
      manifest,
      mockImu: imu,
      pose2d: pose,
      messageId: 'msg-pass9-test',
    });
    expect(() => formSampleSchema.parse(sample)).not.toThrow();
  });
});
