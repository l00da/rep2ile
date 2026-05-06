const JOINT_TRIPLET = 17 * 3;

export type Coco17KeypointsValidation =
  | {ok: true; frameCount: number}
  | {ok: false; message: string};

/**
 * Validates PerfectRep-style wild JSON: top-level `keypoints` flattened array,
 * reshapeable to [frames, 17, 3].
 */
export function validateCoco17KeypointsJson(raw: unknown): Coco17KeypointsValidation {
  if (raw === null || typeof raw !== 'object') {
    return {ok: false, message: 'JSON root must be an object'};
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.keypoints)) {
    return {ok: false, message: 'Missing top-level array `keypoints`'};
  }
  const kp = record.keypoints as unknown[];
  if (kp.length === 0) {
    return {ok: false, message: '`keypoints` must be non-empty'};
  }
  for (let i = 0; i < kp.length; i += 1) {
    if (typeof kp[i] !== 'number' || Number.isNaN(kp[i])) {
      return {
        ok: false,
        message: `keypoints[${i}] must be a finite number`,
      };
    }
  }
  if (kp.length % JOINT_TRIPLET !== 0) {
    return {
      ok: false,
      message: `keypoints length ${kp.length} is not divisible by ${JOINT_TRIPLET} (17×3)`,
    };
  }
  const frameCount = kp.length / JOINT_TRIPLET;
  return {ok: true, frameCount};
}
