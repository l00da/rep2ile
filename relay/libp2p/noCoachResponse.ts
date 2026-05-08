import {
  coachAnalysisResultSchema,
  skeleton3dSequenceSchema,
  type CoachAnalysisResult,
  type FormSample,
} from '../../packages/protocol/schemas.ts';
import {RelayLifecycleRecorder} from '../RelayLifecycleRecorder.ts';
import {writeJsonToStream} from '../../shared/reptileStreamCodec.ts';

type StreamLike = {
  source: AsyncIterable<Uint8Array>;
  sink: (source: AsyncIterable<Uint8Array>) => Promise<void>;
};

export function buildCoachUnavailableResult(
  sample: FormSample,
  relayNodeId: string,
): CoachAnalysisResult {
  return coachAnalysisResultSchema.parse({
    message_type: 'coach_analysis_result',
    message_id: `relay-error-${sample.message_id}`,
    session_id: sample.session_id,
    sender_node_id: relayNodeId,
    receiver_node_id: sample.sender_node_id,
    created_at_iso: new Date().toISOString(),
    source: 'mock',
    feedback_summary: 'No coach peer is currently connected to relay.',
    feedback_rules: [
      {
        rule_id: 'coach-unavailable',
        severity: 'critical',
        message:
          'Relay could not route this form_sample because no coach peer is available.',
      },
    ],
    skeleton_3d_sequence: skeleton3dSequenceSchema.parse({
      schema_version: '1.0.0',
      joint_schema: 'coco_17',
      coordinate_space: 'normalized_n11',
      frames: [
        {
          frame_index: 0,
          timestamp_ms: 0,
          joints: Array.from({length: 17}, (_, jointIndex) => ({
            joint_index: jointIndex,
            x: 0,
            y: 0,
            z: 0,
          })),
        },
      ],
    }),
    artifact_refs: [{kind: 'other', uri: 'relay://coach-unavailable'}],
  });
}

export async function respondNoCoachAvailable(params: {
  athleteStream: StreamLike;
  sample: FormSample;
  relayNodeId: string;
  recorder: RelayLifecycleRecorder;
}): Promise<CoachAnalysisResult> {
  const result = buildCoachUnavailableResult(params.sample, params.relayNodeId);
  await writeJsonToStream(params.athleteStream, result);
  params.recorder.recordRelayForwardedToAthlete(
    params.sample,
    result,
    params.relayNodeId,
  );
  return result;
}
