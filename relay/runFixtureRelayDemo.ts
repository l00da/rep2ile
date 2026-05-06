import {FixturePose2DExtractor} from '../athlete-node/vision/vitpose/FixturePose2DExtractor';
import {createCoachPerfectRepLifter} from '../coach-node/perfectrep/createCoachPerfectRepLifter';
import {
  coachAnalysisResultSchema,
  formSampleSchema,
  mockImuPayloadSchema,
  videoClipManifestSchema,
  type CoachAnalysisResult,
  type FormSample,
  type MockImuPayload,
  type VideoClipManifest,
} from '../packages/protocol/schemas';
import {RelayLifecycleRecorder} from './RelayLifecycleRecorder';

export const DEMO_RELAY_NODE_ID = 'relay-1';

/** Shared fixture clip + IMU for relay CLI, demo walkthrough, and tests. */
export const DEMO_CLIP_MANIFEST: VideoClipManifest = videoClipManifestSchema.parse({
  clip_id: 'clip-relay-demo',
  session_id: 'session-relay-demo',
  athlete_node_id: 'athlete-1',
  file_uri: 'file:///fixtures/video/squat-demo.mp4',
  mime_type: 'video/mp4',
  duration_ms: 1200,
  frame_rate_fps: 30,
  frame_width: 640,
  frame_height: 480,
  captured_at_iso: '2026-05-06T17:00:00.000Z',
});

export const DEMO_IMU_PAYLOAD: MockImuPayload = mockImuPayloadSchema.parse({
  source: 'mock',
  sampling_hz: 50,
  rep_count: 1,
  peak_velocity_mps: 0.42,
  mean_velocity_mps: 0.31,
  velocity_loss_pct: 12.5,
  frames: [
    {t_ms: 0, accel_mps2: [0, 9.81, 0], gyro_rads: [0, 0, 0]},
    {t_ms: 20, accel_mps2: [0.05, 9.75, 0], gyro_rads: [0.01, 0, 0]},
  ],
});

export function buildCoachAnalysisResult(params: {
  formSample: FormSample;
  lift: {
    skeleton_3d_sequence: CoachAnalysisResult['skeleton_3d_sequence'];
    artifact_refs: CoachAnalysisResult['artifact_refs'];
  };
  coachMessageId?: string;
  createdAtIso?: string;
}): CoachAnalysisResult {
  const {formSample, lift} = params;
  const messageId =
    params.coachMessageId ?? `coach-reply-${formSample.message_id}`;

  return coachAnalysisResultSchema.parse({
    message_type: 'coach_analysis_result',
    message_id: messageId,
    session_id: formSample.session_id,
    sender_node_id: formSample.receiver_node_id,
    receiver_node_id: formSample.sender_node_id,
    created_at_iso:
      params.createdAtIso ?? new Date().toISOString(),
    source: 'mock',
    feedback_summary: 'Fixture relay demo — mock analysis.',
    feedback_rules: [
      {
        rule_id: 'relay-demo-1',
        severity: 'info',
        message: 'Depth looks acceptable for a smoke test.',
      },
    ],
    skeleton_3d_sequence: lift.skeleton_3d_sequence,
    artifact_refs: lift.artifact_refs,
  });
}

export async function runFixtureRelayDemo(options?: {
  now?: () => number;
  relayNodeId?: string;
}): Promise<{
  formSample: FormSample;
  coachAnalysis: CoachAnalysisResult;
  recorder: RelayLifecycleRecorder;
}> {
  const relayNodeId = options?.relayNodeId ?? DEMO_RELAY_NODE_ID;
  const recorder = new RelayLifecycleRecorder({now: options?.now});

  const clip = DEMO_CLIP_MANIFEST;
  const imu = DEMO_IMU_PAYLOAD;

  const extractor = new FixturePose2DExtractor();
  const pose = await extractor.extractFromClip(clip, {async: true});

  const formSample = formSampleSchema.parse({
    message_type: 'form_sample',
    message_id: 'msg-form-relay-demo',
    session_id: clip.session_id,
    sender_node_id: clip.athlete_node_id,
    receiver_node_id: 'coach-1',
    created_at_iso: '2026-05-06T17:00:01.000Z',
    video_clip_manifest: clip,
    mock_imu_payload: imu,
    pose2d_keypoints: pose,
    notes: JSON.stringify({exercise: 'squat', rep_count: 1}),
  });

  recorder.recordAthleteCreatedFormSample(formSample);
  recorder.recordRelayReceivedFormSample(formSample, relayNodeId);
  recorder.recordRelayForwardedToCoach(
    formSample,
    relayNodeId,
    formSample.receiver_node_id,
  );

  const lifter = createCoachPerfectRepLifter();
  const lift = await lifter.lift(formSample);
  const coachAnalysis = buildCoachAnalysisResult({formSample, lift});

  recorder.recordCoachReturnedAnalysis(formSample, coachAnalysis);
  recorder.recordRelayForwardedToAthlete(formSample, coachAnalysis, relayNodeId);

  return {formSample, coachAnalysis, recorder};
}
