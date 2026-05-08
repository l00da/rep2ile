import {
  coachAnalysisResultSchema,
  type CoachAnalysisResult,
  type FormSample,
} from '../../packages/protocol/schemas.ts';
import {RelayLifecycleRecorder} from '../RelayLifecycleRecorder.ts';
import {
  parseCoachAnalysisResultFromStream,
  writeJsonToStream,
} from '../../shared/reptileStreamCodec.ts';

type StreamLike = {
  source: AsyncIterable<Uint8Array>;
  sink: (source: AsyncIterable<Uint8Array>) => Promise<void>;
};

export async function routeFormSampleThroughCoach(params: {
  formSample: FormSample;
  athleteStream: StreamLike;
  relayNodeId: string;
  recorder: RelayLifecycleRecorder;
  openCoachStream: (sample: FormSample) => Promise<{
    stream: StreamLike;
    coachPeerId: string;
  }>;
}): Promise<CoachAnalysisResult> {
  params.recorder.recordRelayReceivedFormSample(
    params.formSample,
    params.relayNodeId,
  );
  const {stream: coachStream, coachPeerId} = await params.openCoachStream(
    params.formSample,
  );
  params.recorder.recordRelayForwardedToCoach(
    params.formSample,
    params.relayNodeId,
    coachPeerId,
  );

  await writeJsonToStream(coachStream, params.formSample);
  const coachResult = coachAnalysisResultSchema.parse(
    await parseCoachAnalysisResultFromStream(coachStream),
  );
  params.recorder.recordCoachReturnedAnalysis(params.formSample, coachResult);

  coachAnalysisResultSchema.parse(coachResult);
  await writeJsonToStream(params.athleteStream, coachResult);
  params.recorder.recordRelayForwardedToAthlete(
    params.formSample,
    coachResult,
    params.relayNodeId,
  );

  return coachResult;
}
