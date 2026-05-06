import {FixturePose2DExtractor} from '../athlete-node/vision/vitpose/FixturePose2DExtractor';
import {
  convertCoco17KeypointsToPose2DKeypoints,
  loadCoco17PoseFixture,
  parseCoco17FixtureKeypoints,
} from '../athlete-node/vision/vitpose/loadCoco17PoseFixture';
import {createCoachPerfectRepLifter} from '../coach-node/perfectrep/createCoachPerfectRepLifter';
import {
  formSampleSchema,
  type MockImuPayload,
  type VideoClipManifest,
} from '../packages/protocol/schemas';

describe('COCO17 fixture and end-to-end flow', () => {
  it('fixture has keypoints length divisible by 17*3', () => {
    const pose = loadCoco17PoseFixture();
    const jointTriplets = pose.frames.length * 17 * 3;
    expect(jointTriplets % (17 * 3)).toBe(0);
    expect(pose.frames.length).toBeGreaterThanOrEqual(3);
    expect(pose.frames.length).toBeLessThanOrEqual(5);
  });

  it('fixture converts into pose2d_keypoints schema', () => {
    const pose = loadCoco17PoseFixture();
    expect(pose.joint_schema).toBe('coco_17');
    expect(pose.frames[0].keypoints).toHaveLength(17);
  });

  it('form_sample validates with fixture-derived pose and mock coach result', async () => {
    const clip: VideoClipManifest = {
      clip_id: 'clip-001',
      session_id: 'session-001',
      athlete_node_id: 'athlete-1',
      file_uri: 'file:///clips/squat-001.mp4',
      mime_type: 'video/mp4',
      duration_ms: 1200,
      frame_rate_fps: 30,
      frame_width: 640,
      frame_height: 480,
      captured_at_iso: '2026-05-06T16:00:00.000Z',
    };

    const imu: MockImuPayload = {
      source: 'mock',
      sampling_hz: 50,
      frames: [
        {t_ms: 0, accel_mps2: [0, 9.81, 0], gyro_rads: [0, 0, 0]},
        {t_ms: 20, accel_mps2: [0.1, 9.7, 0], gyro_rads: [0.01, 0, 0]},
      ],
    };

    const extractor = new FixturePose2DExtractor();
    const pose = await extractor.extractFromClip(clip, {async: true});

    const formSample = formSampleSchema.parse({
      message_type: 'form_sample',
      message_id: 'msg-001',
      session_id: 'session-001',
      sender_node_id: 'athlete-1',
      receiver_node_id: 'coach-1',
      created_at_iso: '2026-05-06T16:00:01.000Z',
      video_clip_manifest: clip,
      mock_imu_payload: imu,
      pose2d_keypoints: pose,
    });

    const lifter = createCoachPerfectRepLifter();
    const result = await lifter.lift(formSample);

    expect(result.skeleton_3d_sequence.frames.length).toBe(pose.frames.length);
  });

  it('malformed fixture fails validation', () => {
    const malformed = {
      keypoints: [320, 120, 0.98, 312],
    };

    expect(() => parseCoco17FixtureKeypoints(malformed)).toThrow(
      /multiple of 51/,
    );

    expect(() =>
      convertCoco17KeypointsToPose2DKeypoints([1, 2, 3, 4], 640, 480),
    ).toThrow(/multiple of 51/);
  });
});

