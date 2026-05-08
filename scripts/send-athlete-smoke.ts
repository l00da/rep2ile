import {FixturePose2DExtractor} from '../athlete-node/vision/vitpose/FixturePose2DExtractor.ts';
import {createAthleteNode} from '../athlete/libp2p/createAthleteNode.ts';
import {formSampleSchema} from '../packages/protocol/schemas.ts';
import {DEMO_CLIP_MANIFEST, DEMO_IMU_PAYLOAD} from '../relay/runFixtureRelayDemo.ts';

function deriveScore(result: {
  feedback_rules: Array<{severity: 'info' | 'warning' | 'critical'}>;
}): number {
  const penalties = result.feedback_rules.reduce((acc, rule) => {
    if (rule.severity === 'critical') {
      return acc + 35;
    }
    if (rule.severity === 'warning') {
      return acc + 15;
    }
    return acc + 2;
  }, 0);
  return Math.max(0, 100 - penalties);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function main() {
  const relayMultiaddr = process.env.RELAY_MULTIADDR?.trim();
  if (relayMultiaddr == null || relayMultiaddr === '') {
    throw new Error(
      'RELAY_MULTIADDR is required. Example: RELAY_MULTIADDR=/ip4/127.0.0.1/tcp/15001/ws/p2p/<relayPeerId>',
    );
  }

  const athlete = await createAthleteNode({relayMultiaddr});
  try {
    const extractor = new FixturePose2DExtractor();
    const pose = await extractor.extractFromClip(DEMO_CLIP_MANIFEST, {async: true});

    const formSample = formSampleSchema.parse({
      message_type: 'form_sample',
      message_id: `msg-athlete-smoke-${Date.now()}`,
      session_id: DEMO_CLIP_MANIFEST.session_id,
      sender_node_id: athlete.node.peerId.toString(),
      receiver_node_id: 'coach-1',
      created_at_iso: new Date().toISOString(),
      video_clip_manifest: {
        ...DEMO_CLIP_MANIFEST,
        athlete_node_id: athlete.node.peerId.toString(),
      },
      mock_imu_payload: DEMO_IMU_PAYLOAD,
      pose2d_keypoints: pose,
      notes: JSON.stringify({flow: 'separate-process-smoke'}),
    });

    const result = await withTimeout(athlete.sendFormSample(formSample), 12_000);
    const score = deriveScore(result);
    const frameCount = result.skeleton_3d_sequence.frames.length;

    console.log(`[p2p:athlete] message_id=${formSample.message_id}`);
    console.log(
      `[p2p:athlete] coach_analysis_result source=${result.source} score=${score} frame_count=${frameCount}`,
    );
  } finally {
    await athlete.stop();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(
      `[p2p:athlete] fatal: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
