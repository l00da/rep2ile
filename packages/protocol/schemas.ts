import {z} from 'zod';

export const videoClipManifestSchema = z.object({
  clip_id: z.string().min(1),
  session_id: z.string().min(1),
  athlete_node_id: z.string().min(1),
  /** Logical clip URI — always metadata/placeholder; never embed raw video bytes. */
  file_uri: z.string().min(1),
  mime_type: z.string().default('video/mp4'),
  duration_ms: z.number().int().nonnegative(),
  frame_rate_fps: z.number().positive(),
  frame_width: z.number().int().positive(),
  frame_height: z.number().int().positive(),
  captured_at_iso: z.string().min(1),
  /** Pass 9 — optional duplicate placeholder (e.g. object URL label); safe to omit. */
  clip_uri: z.string().min(1).optional(),
  frame_count: z.number().int().nonnegative().optional(),
  captured_at_ms: z.number().int().nonnegative().optional(),
  exercise: z.string().min(1).optional(),
  set_id: z.string().min(1).optional(),
});

export const mockImuFrameSchema = z.object({
  t_ms: z.number().int().nonnegative(),
  accel_mps2: z.tuple([z.number(), z.number(), z.number()]),
  gyro_rads: z.tuple([z.number(), z.number(), z.number()]),
});

export const mockImuPayloadSchema = z.object({
  source: z.literal('mock'),
  sampling_hz: z.number().positive(),
  frames: z.array(mockImuFrameSchema).min(1),
  /** Pass 9 — static summary fields for demo packets (optional). */
  rep_count: z.number().int().positive().optional(),
  peak_velocity_mps: z.number().optional(),
  mean_velocity_mps: z.number().optional(),
  velocity_loss_pct: z.number().optional(),
});

export const pose2dJointSchema = z.object({
  joint_index: z.number().int().min(0).max(16),
  x: z.number(),
  y: z.number(),
  confidence: z.number().min(0).max(1),
});

export const pose2dFrameSchema = z.object({
  frame_index: z.number().int().nonnegative(),
  timestamp_ms: z.number().int().nonnegative(),
  keypoints: z.array(pose2dJointSchema).length(17),
});

export const pose2dKeypointsSchema = z.object({
  schema_version: z.literal('1.0.0'),
  joint_schema: z.literal('coco_17'),
  coordinate_space: z.enum(['pixel', 'normalized']),
  frame_width: z.number().int().positive(),
  frame_height: z.number().int().positive(),
  frames: z.array(pose2dFrameSchema).min(1),
});

export const formSampleSchema = z.object({
  message_type: z.literal('form_sample'),
  message_id: z.string().min(1),
  session_id: z.string().min(1),
  sender_node_id: z.string().min(1),
  receiver_node_id: z.string().min(1),
  created_at_iso: z.string().min(1),
  video_clip_manifest: videoClipManifestSchema,
  mock_imu_payload: mockImuPayloadSchema.optional(),
  pose2d_keypoints: pose2dKeypointsSchema.optional(),
  notes: z.string().optional(),
});

export const relayPacketLifecycleSchema = z.object({
  message_id: z.string().min(1),
  session_id: z.string().min(1),
  sender_node_id: z.string().min(1),
  receiver_node_id: z.string().min(1),
  created_at_iso: z.string().min(1),
  forwarded_at_iso: z.string().optional(),
  processed_at_iso: z.string().optional(),
  status: z.enum(['received', 'queued', 'forwarded', 'processed', 'failed']),
  payload_preview: z.string().min(1),
});

/** Pass 7 — observable relay lifecycle (no networking). */
export const relayObservationEventKindSchema = z.enum([
  'athlete_created_form_sample',
  'relay_received_form_sample',
  'relay_forwarded_to_coach',
  'coach_returned_analysis',
  'relay_forwarded_to_athlete',
]);

export const relayObservationStatusSchema = z.enum([
  'created',
  'received',
  'forwarded',
  'processed',
  'delivered',
  'failed',
]);

export const relayObservationSchema = z.object({
  observation_id: z.string().min(1),
  event_kind: relayObservationEventKindSchema,
  message_id: z.string().min(1),
  session_id: z.string().min(1),
  source_message_id: z.string().optional(),
  sender_node_id: z.string().min(1),
  receiver_node_id: z.string().min(1),
  message_type: z.string().min(1),
  status: relayObservationStatusSchema,
  created_at_ms: z.number().int().nonnegative(),
  received_at_ms: z.number().int().nonnegative().optional(),
  forwarded_at_ms: z.number().int().nonnegative().optional(),
  payload_preview: z.string().min(1),
});

/** One joint; semantics determined by parent `skeleton_3d_sequence` fields. */
export const skeleton3dJointSchema = z.object({
  joint_index: z.number().int().min(0).max(16),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const skeleton3dFrameSchema = z.object({
  frame_index: z.number().int().nonnegative(),
  timestamp_ms: z.number().int().nonnegative(),
  joints: z.array(skeleton3dJointSchema).length(17),
});

/**
 * Coach → athlete 3D skeleton replay (`coach_analysis_result.skeleton_3d_sequence`).
 *
 * **Coordinate space (`normalized_n11`)**: each `x`, `y`, `z` is in **[-1, 1]** — same as
 * PerfectRep `infer_wild.py` **without** `--pixel`. Do **not** pass `--pixel` from the bridge;
 * pixel space is out of contract.
 *
 * **Axes**: **x** = horizontal (right positive), **y** = vertical (up positive in model space),
 * **z** = depth (toward camera positive; verify in your viewer).
 *
 * **Joint order (`coco_17`)**: `joint_index` 0–16 = **MS COCO body keypoints** (same index
 * semantics as `pose2d_keypoints.joint_schema: coco_17`).
 */
export const skeleton3dSequenceSchema = z.object({
  schema_version: z.literal('1.0.0'),
  joint_schema: z.literal('coco_17'),
  coordinate_space: z.literal('normalized_n11'),
  frames: z.array(skeleton3dFrameSchema).min(1),
});

export const coachAnalysisResultSchema = z.object({
  message_type: z.literal('coach_analysis_result'),
  message_id: z.string().min(1),
  session_id: z.string().min(1),
  sender_node_id: z.string().min(1),
  receiver_node_id: z.string().min(1),
  created_at_iso: z.string().min(1),
  source: z.enum(['mock', 'perfectrep']),
  feedback_summary: z.string(),
  feedback_rules: z.array(
    z.object({
      rule_id: z.string(),
      severity: z.enum(['info', 'warning', 'critical']),
      message: z.string(),
    }),
  ),
  skeleton_3d_sequence: skeleton3dSequenceSchema,
  artifact_refs: z
    .array(
      z.object({
        kind: z.enum(['x3d_npy', 'x3d_mp4', 'other']),
        uri: z.string().min(1),
      }),
    )
    .default([]),
});

export type VideoClipManifest = z.infer<typeof videoClipManifestSchema>;
export type MockImuPayload = z.infer<typeof mockImuPayloadSchema>;
export type Pose2DKeypoints = z.infer<typeof pose2dKeypointsSchema>;
export type FormSample = z.infer<typeof formSampleSchema>;
export type Skeleton3DSequence = z.infer<typeof skeleton3dSequenceSchema>;
export type CoachAnalysisResult = z.infer<typeof coachAnalysisResultSchema>;
export type RelayPacketLifecycle = z.infer<typeof relayPacketLifecycleSchema>;
export type RelayObservation = z.infer<typeof relayObservationSchema>;
export type RelayObservationEventKind = z.infer<
  typeof relayObservationEventKindSchema
>;
