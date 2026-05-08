import type {
  CoachAnalysisResult,
  FormSample,
} from '../packages/protocol/schemas.ts';

const DEFAULT_MAX_PREVIEW_CHARS = 900;

export function parseExerciseMetaFromNotes(notes?: string): {
  exercise?: string;
  rep_count?: number;
} {
  if (!notes?.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(notes);
    if (parsed === null || typeof parsed !== 'object') {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const exercise =
      typeof record.exercise === 'string' ? record.exercise : undefined;
    const rep_count =
      typeof record.rep_count === 'number' ? record.rep_count : undefined;
    return {exercise, rep_count};
  } catch {
    return {};
  }
}

/** Shorten URIs and strings for safe logs — never embed binary or large arrays. */
export function truncateForRelayPreview(s: string, maxLen: number): string {
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, maxLen)}…`;
}

/**
 * Summarized JSON only — excludes pose frames/keypoints and raw video bytes.
 */
export function previewFormSampleForRelay(sample: FormSample): string {
  const meta = parseExerciseMetaFromNotes(sample.notes);
  const uriPreview = truncateForRelayPreview(
    sample.video_clip_manifest.clip_uri ??
      sample.video_clip_manifest.file_uri,
    80,
  );
  const slim = {
    message_type: sample.message_type,
    message_id: sample.message_id,
    session_id: sample.session_id,
    ...meta,
    video_clip_manifest: {
      clip_id: sample.video_clip_manifest.clip_id,
      duration_ms: sample.video_clip_manifest.duration_ms,
      frame_width: sample.video_clip_manifest.frame_width,
      frame_height: sample.video_clip_manifest.frame_height,
      mime_type: sample.video_clip_manifest.mime_type,
      exercise: sample.video_clip_manifest.exercise,
      set_id: sample.video_clip_manifest.set_id,
      frame_count: sample.video_clip_manifest.frame_count,
      captured_at_ms: sample.video_clip_manifest.captured_at_ms,
      clip_uri_preview: uriPreview,
      file_uri_preview: uriPreview,
    },
    mock_imu_payload: sample.mock_imu_payload
      ? {
          source: sample.mock_imu_payload.source,
          sampling_hz: sample.mock_imu_payload.sampling_hz,
          frame_count: sample.mock_imu_payload.frames.length,
          rep_count: sample.mock_imu_payload.rep_count,
          peak_velocity_mps: sample.mock_imu_payload.peak_velocity_mps,
          mean_velocity_mps: sample.mock_imu_payload.mean_velocity_mps,
          velocity_loss_pct: sample.mock_imu_payload.velocity_loss_pct,
        }
      : undefined,
    pose2d_keypoints_summary: sample.pose2d_keypoints
      ? {
          schema_version: sample.pose2d_keypoints.schema_version,
          joint_schema: sample.pose2d_keypoints.joint_schema,
          coordinate_space: sample.pose2d_keypoints.coordinate_space,
          frame_count: sample.pose2d_keypoints.frames.length,
          joint_count_per_frame: 17,
        }
      : undefined,
  };
  return stringifyRelayPreview(slim);
}

/**
 * Summarized coach reply — no skeleton joint arrays.
 */
export function previewCoachAnalysisForRelay(
  result: CoachAnalysisResult,
): string {
  const slim = {
    message_type: result.message_type,
    message_id: result.message_id,
    session_id: result.session_id,
    source: result.source,
    feedback_summary: truncateForRelayPreview(result.feedback_summary, 160),
    skeleton_3d_summary: {
      schema_version: result.skeleton_3d_sequence.schema_version,
      joint_schema: result.skeleton_3d_sequence.joint_schema,
      coordinate_space: result.skeleton_3d_sequence.coordinate_space,
      frame_count: result.skeleton_3d_sequence.frames.length,
      joint_count_per_frame: 17,
    },
    artifact_refs: result.artifact_refs,
    feedback_rules_count: result.feedback_rules.length,
  };
  return stringifyRelayPreview(slim);
}

export function stringifyRelayPreview(value: unknown): string {
  const raw = JSON.stringify(value);
  return truncateForRelayPreview(raw, DEFAULT_MAX_PREVIEW_CHARS);
}
