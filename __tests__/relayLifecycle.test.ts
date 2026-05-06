import {
  formSampleSchema,
  relayObservationSchema,
} from '../packages/protocol/schemas';
import {RelayLifecycleRecorder} from '../relay/RelayLifecycleRecorder';
import {runFixtureRelayDemo} from '../relay/runFixtureRelayDemo';

describe('Pass 7 relay visibility', () => {
  it('relay observations validate', async () => {
    let tick = 1_700_000_000_000;
    const {recorder} = await runFixtureRelayDemo({
      now: () => {
        tick += 1;
        return tick;
      },
    });

    const observations = recorder.validateAll();
    expect(observations).toHaveLength(5);
    for (const o of observations) {
      expect(() => relayObservationSchema.parse(o)).not.toThrow();
    }
  });

  it('lifecycle has expected event order', async () => {
    const {recorder} = await runFixtureRelayDemo();
    const kinds = recorder.getObservations().map(o => o.event_kind);
    expect(kinds).toEqual(RelayLifecycleRecorder.expectedEventOrder());
  });

  it('payload_preview never includes full video data or full keypoint arrays', async () => {
    const {recorder} = await runFixtureRelayDemo();
    const observations = recorder.getObservations();

    for (const o of observations) {
      expect(o.payload_preview.length).toBeLessThanOrEqual(950);
      expect(o.payload_preview).not.toMatch(/"keypoints"\s*:/);
      expect(o.payload_preview).not.toMatch(/"joints"\s*:/);
      expect(o.payload_preview).not.toMatch(/"frames"\s*:\s*\[/);
      expect(o.payload_preview.toLowerCase()).not.toContain('data:video');
    }
  });

  it('form_sample still validates after demo flow', async () => {
    const {formSample} = await runFixtureRelayDemo();
    expect(() => formSampleSchema.parse(formSample)).not.toThrow();
  });
});
