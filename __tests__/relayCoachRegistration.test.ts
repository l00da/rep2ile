import {coachAnalysisResultSchema, formSampleSchema} from '../packages/protocol/schemas';
import {RelayLifecycleRecorder} from '../relay/RelayLifecycleRecorder';
import {RelayCoachRegistry} from '../relay/libp2p/RelayCoachRegistry';
import {respondNoCoachAvailable} from '../relay/libp2p/noCoachResponse';
import {parseCoachAnalysisResultFromStream} from '../shared/reptileStreamCodec';

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

describe('Relay coach registration + no-coach response', () => {
  it('stores the latest coach registration in relay registry', () => {
    const registry = new RelayCoachRegistry();
    registry.register({
      coachPeerId: '12D3KooWCoachA',
      coachMultiaddrs: ['/ip4/127.0.0.1/tcp/15001/ws/p2p/12D3KooWCoachA'],
      registeredAtMs: 100,
    });

    expect(registry.getCurrentCoachPeerId()).toBe('12D3KooWCoachA');
    expect(registry.getCurrent()?.registeredAtMs).toBe(100);
  });

  it('writes schema-valid no-coach result back to athlete stream', async () => {
    const athleteRelay = createDuplexPair();
    const recorder = new RelayLifecycleRecorder();

    const formSample = formSampleSchema.parse({
      message_type: 'form_sample',
      message_id: 'msg-no-coach',
      session_id: 'session-no-coach',
      sender_node_id: 'athlete-1',
      receiver_node_id: 'coach-1',
      created_at_iso: new Date().toISOString(),
      video_clip_manifest: {
        clip_id: 'clip-no-coach',
        session_id: 'session-no-coach',
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

    await respondNoCoachAvailable({
      athleteStream: athleteRelay.right as any,
      sample: formSample,
      relayNodeId: 'relay-1',
      recorder,
    });

    const athleteReceived = await parseCoachAnalysisResultFromStream(
      athleteRelay.left as any,
    );
    expect(() => coachAnalysisResultSchema.parse(athleteReceived)).not.toThrow();
    expect(athleteReceived.feedback_rules[0]?.rule_id).toBe('coach-unavailable');
  });
});
