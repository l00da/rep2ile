import {skeleton3dSequenceSchema} from '../../packages/protocol/schemas';
import type {Skeleton3DSequence} from '../../packages/protocol/schemas';

export type ConvertX3DOptions = {
  /** Used for `timestamp_ms`; default 30 (match `PERFECTREP_INFER_FPS` when video-free). */
  fps?: number;
};

function clampN11(v: number): number {
  if (v < -1) {
    return -1;
  }
  if (v > 1) {
    return 1;
  }
  return v;
}

/**
 * PerfectRep internal layout is Human3.6M 17-joint order after `coco2h36m`. Wire format uses
 * MS COCO index order (`coco_17`). Unambiguous joints map 1:1; eyes/ears share H36M head
 * proxy row (index 10) — consistent with the forward blend in PerfectRep `coco2h36m`.
 */
function h36mFrameToCoco17Wire(h: number[][]): number[][] {
  const head = h[10]!;
  return [
    h[9]!,
    head,
    head,
    head,
    head,
    h[11]!,
    h[14]!,
    h[12]!,
    h[15]!,
    h[13]!,
    h[16]!,
    h[4]!,
    h[1]!,
    h[5]!,
    h[2]!,
    h[6]!,
    h[3]!,
  ];
}

/**
 * Converts in-memory PerfectRep X3D output `(T × 17 × 3)` into RepTile
 * `skeleton_3d_sequence`. Input rows are **H36M order** (as saved by `infer_wild.py` /
 * `X3D.npy`); output joints are **COCO-17 wire order** with `coordinate_space` **`normalized_n11`**
 * ([-1, 1] — corresponds to `infer_wild.py` **without** `--pixel`; bridge never passes `--pixel`).
 */
export function convertPerfectRepX3DToSkeletonSequence(
  xyz: number[][][],
  options?: ConvertX3DOptions,
): Skeleton3DSequence {
  const fps = options?.fps ?? 30;

  if (!Array.isArray(xyz) || xyz.length === 0) {
    throw new Error('X3D array must be a non-empty list of frames');
  }

  const frames = xyz.map((frame, frame_index) => {
    if (!Array.isArray(frame) || frame.length !== 17) {
      throw new Error(
        `Frame ${frame_index}: expected 17 joints, got ${frame?.length}`,
      );
    }
    const wire = h36mFrameToCoco17Wire(frame);
    const joints = wire.map((j, joint_index) => {
      if (!Array.isArray(j) || j.length !== 3) {
        throw new Error(
          `Frame ${frame_index} joint ${joint_index}: expected [x,y,z]`,
        );
      }
      return {
        joint_index,
        x: clampN11(j[0]),
        y: clampN11(j[1]),
        z: clampN11(j[2]),
      };
    });
    return {
      frame_index,
      timestamp_ms: Math.round((frame_index * 1000) / fps),
      joints,
    };
  });

  return skeleton3dSequenceSchema.parse({
    schema_version: '1.0.0',
    joint_schema: 'coco_17',
    coordinate_space: 'normalized_n11',
    frames,
  });
}

/**
 * Parses JSON produced by `scripts/convert_x3d_npy_to_skeleton_json.py`
 * (already matches `skeleton_3d_sequence` schema).
 */
export function parseSkeletonSequenceJson(raw: unknown): Skeleton3DSequence {
  return skeleton3dSequenceSchema.parse(raw);
}
