import {FixturePose2DExtractor} from '../athlete-node/vision/vitpose/FixturePose2DExtractor';
import {createCoachPerfectRepLifter} from '../coach-node/perfectrep/createCoachPerfectRepLifter';
import {formSampleSchema} from '../packages/protocol/schemas';
import type {
  CoachAnalysisResult,
  FormSample,
} from '../packages/protocol/schemas';

import {
  buildCoachAnalysisResult,
  DEMO_CLIP_MANIFEST,
  DEMO_IMU_PAYLOAD,
  DEMO_RELAY_NODE_ID,
} from './runFixtureRelayDemo';
import {RelayLifecycleRecorder} from './RelayLifecycleRecorder';

export type WalkthroughStepStatus = 'pending' | 'running' | 'complete';

/**
 * Runs the same fixture pipeline as `runFixtureRelayDemo`, but drives eight UI steps
 * (Athlete → Relay → Coach → Athlete) with observable status transitions.
 */
export async function runRepTileWalkthrough(options: {
  onStep: (stepIndex: number, status: WalkthroughStepStatus) => void;
  stepDelayMs?: number;
  /** Override relay clock for deterministic tests */
  now?: () => number;
}): Promise<{
  formSample: FormSample;
  coachAnalysis: CoachAnalysisResult;
  recorder: RelayLifecycleRecorder;
}> {
  const sleep = (ms: number) =>
    new Promise<void>(resolve => setTimeout(resolve, ms));
  const gap = options.stepDelayMs ?? 100;

  const clip = DEMO_CLIP_MANIFEST;
  const imu = DEMO_IMU_PAYLOAD;
  const recorder = new RelayLifecycleRecorder({now: options?.now});

  // Step 1 — Athlete captures short clip (manifest metadata only).
  options.onStep(0, 'running');
  await sleep(gap);
  options.onStep(0, 'complete');

  // Step 2 — Mock IMU payload.
  options.onStep(1, 'running');
  await sleep(gap);
  options.onStep(1, 'complete');

  // Step 3 — Fixture / ViTPose-style COCO-17 pose2d.
  options.onStep(2, 'running');
  const extractor = new FixturePose2DExtractor();
  const pose = await extractor.extractFromClip(clip, {async: true});
  options.onStep(2, 'complete');

  // Step 4 — Compose form_sample.
  options.onStep(3, 'running');
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
  await sleep(gap);
  options.onStep(3, 'complete');

  // Step 5 — Relay observes and forwards.
  options.onStep(4, 'running');
  recorder.recordAthleteCreatedFormSample(formSample);
  recorder.recordRelayReceivedFormSample(formSample, DEMO_RELAY_NODE_ID);
  recorder.recordRelayForwardedToCoach(
    formSample,
    DEMO_RELAY_NODE_ID,
    formSample.receiver_node_id,
  );
  await sleep(gap);
  options.onStep(4, 'complete');

  // Step 6 — Coach toy analysis (mock lifter; real PerfectRep stays opt-in).
  options.onStep(5, 'running');
  const lifter = createCoachPerfectRepLifter();
  const lift = await lifter.lift(formSample);
  await sleep(gap);
  options.onStep(5, 'complete');

  // Step 7 — coach_analysis_result + relay return path.
  options.onStep(6, 'running');
  const coachAnalysis = buildCoachAnalysisResult({formSample, lift});
  recorder.recordCoachReturnedAnalysis(formSample, coachAnalysis);
  recorder.recordRelayForwardedToAthlete(
    formSample,
    coachAnalysis,
    DEMO_RELAY_NODE_ID,
  );
  await sleep(gap);
  options.onStep(6, 'complete');

  // Step 8 — Athlete receives feedback + skeleton replay (rendered in UI).
  options.onStep(7, 'running');
  await sleep(gap);
  options.onStep(7, 'complete');

  return {formSample, coachAnalysis, recorder};
}
