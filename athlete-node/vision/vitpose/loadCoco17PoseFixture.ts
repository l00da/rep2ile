import * as fs from 'fs';
import * as path from 'path';
import {z} from 'zod';
import {pose2dKeypointsSchema} from '../../../packages/protocol/schemas';
import type {Pose2DKeypoints} from '../../../packages/protocol/schemas';

const COCO17_KEYPOINTS_PER_FRAME = 17 * 3;

const coco17FixtureSchema = z.object({
  keypoints: z.array(z.number()),
});

export function parseCoco17FixtureKeypoints(raw: unknown): number[] {
  const parsed = coco17FixtureSchema.parse(raw);
  if (parsed.keypoints.length % COCO17_KEYPOINTS_PER_FRAME !== 0) {
    throw new Error(
      `Invalid keypoints length: ${parsed.keypoints.length}. Expected a multiple of ${COCO17_KEYPOINTS_PER_FRAME}.`,
    );
  }
  return parsed.keypoints;
}

export function convertCoco17KeypointsToPose2DKeypoints(
  keypoints: number[],
  frameWidth: number,
  frameHeight: number,
): Pose2DKeypoints {
  if (keypoints.length % COCO17_KEYPOINTS_PER_FRAME !== 0) {
    throw new Error(
      `Invalid keypoints length: ${keypoints.length}. Expected a multiple of ${COCO17_KEYPOINTS_PER_FRAME}.`,
    );
  }

  const frameCount = keypoints.length / COCO17_KEYPOINTS_PER_FRAME;
  const frames = Array.from({length: frameCount}, (_, frameIndex) => {
    const frameStart = frameIndex * COCO17_KEYPOINTS_PER_FRAME;
    const joints = Array.from({length: 17}, (_, jointIndex) => {
      const offset = frameStart + jointIndex * 3;
      return {
        joint_index: jointIndex,
        x: keypoints[offset],
        y: keypoints[offset + 1],
        confidence: keypoints[offset + 2],
      };
    });

    return {
      frame_index: frameIndex,
      timestamp_ms: frameIndex * 100,
      keypoints: joints,
    };
  });

  return pose2dKeypointsSchema.parse({
    schema_version: '1.0.0',
    joint_schema: 'coco_17',
    coordinate_space: 'pixel',
    frame_width: frameWidth,
    frame_height: frameHeight,
    frames,
  });
}

function resolveDefaultFixturePath(): string {
  const relativeToModule = path.resolve(
    __dirname,
    '../../../fixtures/pose2d/coco17_squat_tiny.json',
  );
  if (fs.existsSync(relativeToModule)) {
    return relativeToModule;
  }
  const relativeToRepoRoot = path.join(
    process.cwd(),
    'fixtures/pose2d/coco17_squat_tiny.json',
  );
  if (fs.existsSync(relativeToRepoRoot)) {
    return relativeToRepoRoot;
  }
  throw new Error(
    `COCO17 fixture not found (tried ${relativeToModule} and ${relativeToRepoRoot})`,
  );
}

export function loadCoco17PoseFixture(params?: {
  fixturePath?: string;
  frameWidth?: number;
  frameHeight?: number;
}): Pose2DKeypoints {
  const fixturePath = params?.fixturePath ?? resolveDefaultFixturePath();

  const frameWidth = params?.frameWidth ?? 640;
  const frameHeight = params?.frameHeight ?? 480;

  const rawText = fs.readFileSync(fixturePath, 'utf-8');
  const fixtureJson = JSON.parse(rawText) as unknown;
  const keypoints = parseCoco17FixtureKeypoints(fixtureJson);
  return convertCoco17KeypointsToPose2DKeypoints(
    keypoints,
    frameWidth,
    frameHeight,
  );
}
