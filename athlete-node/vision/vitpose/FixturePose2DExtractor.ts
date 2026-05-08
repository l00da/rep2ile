import type {
  Pose2DKeypoints,
  VideoClipManifest,
} from '../../../packages/protocol/schemas.ts';
import {loadCoco17PoseFixture} from './loadCoco17PoseFixture.ts';
import type {VitPoseExtractor} from './VitPoseExtractor.ts';

export class FixturePose2DExtractor implements VitPoseExtractor {
  async extractFromClip(
    clip: VideoClipManifest,
    options?: {async?: boolean},
  ): Promise<Pose2DKeypoints> {
    if (options?.async) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return loadCoco17PoseFixture({
      frameWidth: clip.frame_width,
      frameHeight: clip.frame_height,
    });
  }
}
