import {
  formSampleSchema,
  mockImuPayloadSchema,
  videoClipManifestSchema,
  type FormSample,
  type MockImuPayload,
  type Pose2DKeypoints,
  type VideoClipManifest,
} from '../../packages/protocol/schemas';

/** Static mock IMU for athlete packets (Pass 9 — no randomness). */
export function buildStaticMockImuPayload(): MockImuPayload {
  return mockImuPayloadSchema.parse({
    source: 'mock',
    sampling_hz: 50,
    rep_count: 1,
    peak_velocity_mps: 0.42,
    mean_velocity_mps: 0.31,
    velocity_loss_pct: 12.5,
    frames: [
      {t_ms: 0, accel_mps2: [0, 9.81, 0], gyro_rads: [0, 0, 0]},
      {t_ms: 20, accel_mps2: [0.05, 9.75, 0], gyro_rads: [0.01, 0, 0]},
      {t_ms: 40, accel_mps2: [0.02, 9.78, 0], gyro_rads: [0, 0.01, 0]},
    ],
  });
}

export type CaptureTimingMeta = {
  durationMs: number;
  width: number;
  height: number;
  frameRateFps: number;
  capturedAtMs: number;
  source: 'browser_camera' | 'fallback_timer';
};

/**
 * Metadata-only manifest — URIs are placeholders; never embed encoded video bytes.
 */
export function buildClipManifestFromCapture(
  meta: CaptureTimingMeta,
  params: {
    sessionId: string;
    setId: string;
    exercise: string;
    athleteNodeId: string;
    clipId?: string;
  },
): VideoClipManifest {
  const clip_id = params.clipId ?? `clip-${meta.capturedAtMs}`;
  const placeholder = `placeholder://athlete-capture/${clip_id}`;
  const frame_count = Math.max(
    0,
    Math.round((meta.durationMs / 1000) * meta.frameRateFps),
  );

  return videoClipManifestSchema.parse({
    clip_id,
    session_id: params.sessionId,
    athlete_node_id: params.athleteNodeId,
    file_uri: placeholder,
    clip_uri: placeholder,
    mime_type: 'video/mp4',
    duration_ms: meta.durationMs,
    frame_rate_fps: meta.frameRateFps,
    frame_width: meta.width,
    frame_height: meta.height,
    captured_at_iso: new Date(meta.capturedAtMs).toISOString(),
    captured_at_ms: meta.capturedAtMs,
    frame_count,
    exercise: params.exercise,
    set_id: params.setId,
  });
}

/** Used when no camera session — still produces a valid manifest for demos/tests. */
export function buildFallbackTimerClipManifest(params: {
  sessionId: string;
  setId: string;
  exercise: string;
  athleteNodeId: string;
  durationMs?: number;
}): VideoClipManifest {
  const capturedAtMs = Date.now();
  return buildClipManifestFromCapture(
    {
      durationMs: params.durationMs ?? 800,
      width: 640,
      height: 480,
      frameRateFps: 30,
      capturedAtMs,
      source: 'fallback_timer',
    },
    params,
  );
}

export function composeAthleteFormSample(params: {
  manifest: VideoClipManifest;
  mockImu: MockImuPayload;
  pose2d: Pose2DKeypoints;
  receiverNodeId?: string;
  messageId?: string;
}): FormSample {
  const receiver_node_id = params.receiverNodeId ?? 'coach-1';
  const message_id =
    params.messageId ?? `msg-athlete-${params.manifest.clip_id}`;

  return formSampleSchema.parse({
    message_type: 'form_sample',
    message_id,
    session_id: params.manifest.session_id,
    sender_node_id: params.manifest.athlete_node_id,
    receiver_node_id,
    created_at_iso: new Date().toISOString(),
    video_clip_manifest: params.manifest,
    mock_imu_payload: params.mockImu,
    pose2d_keypoints: params.pose2d,
    notes: JSON.stringify({
      exercise: params.manifest.exercise,
      rep_count: params.mockImu.rep_count,
    }),
  });
}
