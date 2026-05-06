import * as fs from 'fs';
import * as path from 'path';

import {convertPerfectRepX3DToSkeletonSequence} from '../coach-node/perfectrep/convertPerfectRepX3DToSkeletonSequence';
import {createCoachPerfectRepLifter} from '../coach-node/perfectrep/createCoachPerfectRepLifter';
import {PerfectRepRunner} from '../coach-node/perfectrep/PerfectRepRunner';
import type {PerfectRepEnv} from '../coach-node/perfectrep/perfectRepEnv';
import {validateCoco17KeypointsJson} from '../coach-node/perfectrep/validateCoco17KeypointsJson';
import {formSampleSchema} from '../packages/protocol/schemas';

const fixturePath = path.join(__dirname, '../fixtures/pose2d/coco17_squat_tiny.json');

function disabledEnv(): PerfectRepEnv {
  return {
    enabled: false,
    repoPath: '',
    checkpointPath: '',
    outputDir: '',
    inferFps: 30,
    pythonExecutable: 'python3',
  };
}

describe('PerfectRep bridge (experimental, no Python in CI)', () => {
  const savedEnv = {...process.env};

  beforeEach(() => {
    process.env = {...savedEnv};
    delete process.env.PERFECTREP_ENABLED;
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it('validates good COCO-17 keypoints fixture', () => {
    const raw: unknown = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const v = validateCoco17KeypointsJson(raw);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.frameCount).toBe(4);
    }
  });

  it('rejects malformed keypoints JSON', () => {
    expect(validateCoco17KeypointsJson(null).ok).toBe(false);
    expect(validateCoco17KeypointsJson({}).ok).toBe(false);
    expect(validateCoco17KeypointsJson({keypoints: [1, 2]}).ok).toBe(false);
    const badNaN = Array.from({length: 51}, () => 0);
    badNaN[0] = NaN;
    expect(validateCoco17KeypointsJson({keypoints: badNaN}).ok).toBe(false);
  });

  it('disabled runner returns safe disabled result', async () => {
    const runner = new PerfectRepRunner(() => disabledEnv());
    const out = await runner.run({keypointsJsonPath: fixturePath});
    expect(out.kind).toBe('disabled');
    if (out.kind === 'disabled') {
      expect(out.message.toLowerCase()).toContain('disabled');
    }
  });

  it('createCoachPerfectRepLifter works as mock fallback', async () => {
    process.env.PERFECTREP_ENABLED = 'false';
    const lifter = createCoachPerfectRepLifter();
    const sample = formSampleSchema.parse({
      message_type: 'form_sample',
      message_id: 'm1',
      session_id: 's1',
      sender_node_id: 'athlete',
      receiver_node_id: 'coach',
      created_at_iso: '2026-01-01T00:00:00.000Z',
      video_clip_manifest: {
        clip_id: 'c1',
        session_id: 's1',
        athlete_node_id: 'athlete',
        file_uri: 'file:///x.mp4',
        mime_type: 'video/mp4',
        duration_ms: 100,
        frame_rate_fps: 30,
        frame_width: 640,
        frame_height: 480,
        captured_at_iso: '2026-01-01T00:00:00.000Z',
      },
      mock_imu_payload: {
        source: 'mock',
        sampling_hz: 50,
        rep_count: 1,
        peak_velocity_mps: 0.4,
        mean_velocity_mps: 0.3,
        velocity_loss_pct: 0,
        frames: [{t_ms: 0, accel_mps2: [0, 0, 0], gyro_rads: [0, 0, 0]}],
      },
    });
    const lift = await lifter.lift(sample);
    expect(lift.skeleton_3d_sequence.frames.length).toBeGreaterThan(0);
    expect(lift.skeleton_3d_sequence.joint_schema).toBe('coco_17');
    expect(lift.skeleton_3d_sequence.coordinate_space).toBe('normalized_n11');
  });

  it('convertPerfectRepX3DToSkeletonSequence produces schema-valid output', () => {
    const frame = (dx: number): number[][] =>
      Array.from({length: 17}, (_, j) => [j * 0.01 + dx, 0, 0.02 * j]);
    const xyz = [frame(0), frame(0.05)];
    const seq = convertPerfectRepX3DToSkeletonSequence(xyz, {fps: 30});
    expect(seq.joint_schema).toBe('coco_17');
    expect(seq.coordinate_space).toBe('normalized_n11');
    expect(seq.frames).toHaveLength(2);
    expect(seq.frames[1].timestamp_ms).toBeGreaterThan(seq.frames[0].timestamp_ms);
    expect(seq.frames[0].joints).toHaveLength(17);
  });
});
