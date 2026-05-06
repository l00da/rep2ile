import {skeleton3dSequenceSchema} from '../../packages/protocol/schemas';
import type {FormSample, Skeleton3DSequence} from '../../packages/protocol/schemas';
import type {PerfectRep3DLifter} from './PerfectRep3DLifter';

export class MockPerfectRep3DLifter implements PerfectRep3DLifter {
  async lift(sample: FormSample): Promise<{
    skeleton_3d_sequence: Skeleton3DSequence;
    artifact_refs: Array<{kind: 'x3d_npy' | 'x3d_mp4' | 'other'; uri: string}>;
  }> {
    const frameCount = sample.pose2d_keypoints?.frames.length ?? 10;

    const frames = Array.from({length: frameCount}, (_, frameIndex) => ({
      frame_index: frameIndex,
      timestamp_ms: frameIndex * 100,
      joints: Array.from({length: 17}, (_, jointIndex) => ({
        joint_index: jointIndex,
        x: Math.sin(frameIndex * 0.1 + jointIndex * 0.01),
        y: Math.cos(frameIndex * 0.1 + jointIndex * 0.01),
        z: 0.25 + jointIndex * 0.005,
      })),
    }));

    return {
      skeleton_3d_sequence: skeleton3dSequenceSchema.parse({
        schema_version: '1.0.0',
        joint_schema: 'human36m_17',
        coordinate_space: 'model_normalized',
        frames,
      }),
      artifact_refs: [{kind: 'other', uri: 'mock://perfectrep/x3d'}],
    };
  }
}
