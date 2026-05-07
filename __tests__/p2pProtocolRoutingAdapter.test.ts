import {
  coachAnalysisResultSchema,
  formSampleSchema,
} from '../packages/protocol/schemas';
import {RelayLifecycleRecorder} from '../relay/RelayLifecycleRecorder';
import {routeFormSampleThroughCoach} from '../relay/libp2p/relayFormSampleRouting';
import {
  parseCoachAnalysisResultFromStream,
  parseFormSampleFromStream,
  writeJsonToStream,
} from '../shared/reptileStreamCodec';

class AsyncByteQueue implements AsyncIterable<Uint8Array> {
  private readonly buffered: Uint8Array[] = [];
  private readonly waiters: Array<
    (result: IteratorResult<Uint8Array>) => void
  > = [];

  push(chunk: Uint8Array): void {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter({value: chunk, done: false});
      return;
    }
    this.buffered.push(chunk);
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: async () => {
        if (this.buffered.length > 0) {
          return {value: this.buffered.shift()!, done: false};
        }
        return await new Promise<IteratorResult<Uint8Array>>(resolve => {
          this.waiters.push(resolve);
        });
      },
    };
  }
}

function createDuplexPair() {
  const leftInbox = new AsyncByteQueue();
  const rightInbox = new AsyncByteQueue();

  return {
    left: {
      source: leftInbox,
      sink: async (source: AsyncIterable<Uint8Array>) => {
        for await (const chunk of source) {
          rightInbox.push(chunk);
        }
      },
    },
    right: {
      source: rightInbox,
      sink: async (source: AsyncIterable<Uint8Array>) => {
        for await (const chunk of source) {
          leftInbox.push(chunk);
        }
      },
    },
  };
}

describe('Pass A protocol routing adapter', () => {
  it('routes form_sample and records relay observations without sockets', async () => {
    const athleteRelay = createDuplexPair();
    const relayCoach = createDuplexPair();
    const recorder = new RelayLifecycleRecorder();

    const formSample = formSampleSchema.parse({
      message_type: 'form_sample',
      message_id: 'msg-adapter-1',
      session_id: 'session-adapter',
      sender_node_id: 'athlete-1',
      receiver_node_id: 'coach-1',
      created_at_iso: new Date().toISOString(),
      video_clip_manifest: {
        clip_id: 'clip-adapter',
        session_id: 'session-adapter',
        athlete_node_id: 'athlete-1',
        file_uri: 'file:///fixtures/video/squat-demo.mp4',
        mime_type: 'video/mp4',
        duration_ms: 800,
        frame_rate_fps: 30,
        frame_width: 640,
        frame_height: 480,
        captured_at_iso: new Date().toISOString(),
      },
      mock_imu_payload: {
        source: 'mock',
        sampling_hz: 25,
        frames: [{t_ms: 0, accel_mps2: [0, 9.81, 0], gyro_rads: [0, 0, 0]}],
      },
    });

    const coachResult = coachAnalysisResultSchema.parse({
      message_type: 'coach_analysis_result',
      message_id: 'coach-reply-adapter-1',
      session_id: formSample.session_id,
      sender_node_id: 'coach-1',
      receiver_node_id: 'athlete-1',
      created_at_iso: new Date().toISOString(),
      source: 'mock',
      feedback_summary: 'Adapter route completed.',
      feedback_rules: [
        {
          rule_id: 'adapter-smoke',
          severity: 'info',
          message: 'relay routing adapter path passed',
        },
      ],
      skeleton_3d_sequence: {
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
      },
      artifact_refs: [{kind: 'other', uri: 'mock://adapter'}],
    });

    const coachLoop = (async () => {
      const received = await parseFormSampleFromStream(relayCoach.right as any);
      expect(received.message_id).toBe(formSample.message_id);
      await writeJsonToStream(relayCoach.right as any, coachResult);
    })();

    const relayLoop = routeFormSampleThroughCoach({
      formSample,
      athleteStream: athleteRelay.right as any,
      relayNodeId: 'relay-1',
      recorder,
      openCoachStream: async () => ({
        stream: relayCoach.left as any,
        coachPeerId: 'coach-1',
      }),
    });

    await writeJsonToStream(athleteRelay.left as any, formSample);
    const athleteReceived = await parseCoachAnalysisResultFromStream(
      athleteRelay.left as any,
    );

    expect(() => coachAnalysisResultSchema.parse(athleteReceived)).not.toThrow();
    await Promise.all([coachLoop, relayLoop]);

    const kinds = recorder.getObservations().map(o => o.event_kind);
    expect(kinds).toContain('relay_received_form_sample');
    expect(kinds).toContain('relay_forwarded_to_coach');
    expect(kinds).toContain('coach_returned_analysis');
    expect(kinds).toContain('relay_forwarded_to_athlete');
  });
});
