import {z} from 'zod';

export const videoClipManifestSchema = z.object({
  clip_id: z.string().min(1),
  session_id: z.string().min(1),
  athlete_node_id: z.string().min(1),
  file_uri: z.string().min(1),
  mime_type: z.string().default('video/mp4'),
  duration_ms: z.number().int().nonnegative(),
  frame_rate_fps: z.number().positive(),
  frame_width: z.number().int().positive(),
  frame_height: z.number().int().positive(),
  captured_at_iso: z.string().min(1),
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

export const skeleton3dSequenceSchema = z.object({
  schema_version: z.literal('1.0.0'),
  joint_schema: z.literal('human36m_17'),
  coordinate_space: z.enum(['model_normalized', 'pixel_aligned']),
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
