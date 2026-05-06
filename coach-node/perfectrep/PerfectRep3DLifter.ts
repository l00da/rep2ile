import type {
  FormSample,
  Skeleton3DSequence,
} from '../../packages/protocol/schemas';

export interface PerfectRep3DLifter {
  lift(sample: FormSample): Promise<{
    skeleton_3d_sequence: Skeleton3DSequence;
    artifact_refs: Array<{kind: 'x3d_npy' | 'x3d_mp4' | 'other'; uri: string}>;
  }>;
}
