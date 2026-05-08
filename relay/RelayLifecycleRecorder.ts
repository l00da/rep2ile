import {
  relayObservationSchema,
  type CoachAnalysisResult,
  type FormSample,
  type RelayObservation,
  type RelayObservationEventKind,
} from '../packages/protocol/schemas.ts';
import {
  previewCoachAnalysisForRelay,
  previewFormSampleForRelay,
} from './payloadPreview.ts';

export type RelayObservationStatus =
  | 'created'
  | 'received'
  | 'forwarded'
  | 'processed'
  | 'delivered'
  | 'failed';

export class RelayLifecycleRecorder {
  private readonly observations: RelayObservation[] = [];
  private readonly now: () => number;
  private seq = 0;

  constructor(options?: {now?: () => number}) {
    this.now = options?.now ?? (() => Date.now());
  }

  private nextObservationId(): string {
    this.seq += 1;
    return `obs-${this.seq}`;
  }

  private push(obs: Omit<RelayObservation, 'observation_id'>): RelayObservation {
    const full = relayObservationSchema.parse({
      ...obs,
      observation_id: this.nextObservationId(),
    });
    this.observations.push(full);
    return full;
  }

  /** Athlete assembled `form_sample` (logical destination may still be coach). */
  recordAthleteCreatedFormSample(sample: FormSample): RelayObservation {
    const t = this.now();
    return this.push({
      event_kind: 'athlete_created_form_sample',
      message_id: sample.message_id,
      session_id: sample.session_id,
      sender_node_id: sample.sender_node_id,
      receiver_node_id: sample.receiver_node_id,
      message_type: sample.message_type,
      status: 'created',
      created_at_ms: t,
      payload_preview: previewFormSampleForRelay(sample),
    });
  }

  /** Relay ingress from athlete. */
  recordRelayReceivedFormSample(
    sample: FormSample,
    relayNodeId: string,
  ): RelayObservation {
    const t = this.now();
    return this.push({
      event_kind: 'relay_received_form_sample',
      message_id: sample.message_id,
      session_id: sample.session_id,
      sender_node_id: sample.sender_node_id,
      receiver_node_id: relayNodeId,
      message_type: sample.message_type,
      status: 'received',
      created_at_ms: t,
      received_at_ms: t,
      payload_preview: previewFormSampleForRelay(sample),
    });
  }

  /** Relay egress toward coach. */
  recordRelayForwardedToCoach(
    sample: FormSample,
    relayNodeId: string,
    coachNodeId: string,
  ): RelayObservation {
    const t = this.now();
    return this.push({
      event_kind: 'relay_forwarded_to_coach',
      message_id: sample.message_id,
      session_id: sample.session_id,
      sender_node_id: relayNodeId,
      receiver_node_id: coachNodeId,
      message_type: sample.message_type,
      status: 'forwarded',
      created_at_ms: t,
      forwarded_at_ms: t,
      payload_preview: previewFormSampleForRelay(sample),
    });
  }

  recordCoachReturnedAnalysis(
    originalSample: FormSample,
    analysis: CoachAnalysisResult,
  ): RelayObservation {
    const t = this.now();
    return this.push({
      event_kind: 'coach_returned_analysis',
      message_id: analysis.message_id,
      session_id: analysis.session_id,
      source_message_id: originalSample.message_id,
      sender_node_id: analysis.sender_node_id,
      receiver_node_id: analysis.receiver_node_id,
      message_type: analysis.message_type,
      status: 'processed',
      created_at_ms: t,
      payload_preview: previewCoachAnalysisForRelay(analysis),
    });
  }

  recordRelayForwardedToAthlete(
    originalSample: FormSample,
    analysis: CoachAnalysisResult,
    relayNodeId: string,
  ): RelayObservation {
    const t = this.now();
    return this.push({
      event_kind: 'relay_forwarded_to_athlete',
      message_id: analysis.message_id,
      session_id: analysis.session_id,
      source_message_id: originalSample.message_id,
      sender_node_id: relayNodeId,
      receiver_node_id: analysis.receiver_node_id,
      message_type: analysis.message_type,
      status: 'delivered',
      created_at_ms: t,
      forwarded_at_ms: t,
      payload_preview: previewCoachAnalysisForRelay(analysis),
    });
  }

  getObservations(): ReadonlyArray<RelayObservation> {
    return this.observations;
  }

  validateAll(): RelayObservation[] {
    return this.observations.map(o => relayObservationSchema.parse(o));
  }

  static expectedEventOrder(): RelayObservationEventKind[] {
    return [
      'athlete_created_form_sample',
      'relay_received_form_sample',
      'relay_forwarded_to_coach',
      'coach_returned_analysis',
      'relay_forwarded_to_athlete',
    ];
  }
}
