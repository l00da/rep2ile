import type {
  Pose2DKeypoints,
  VideoClipManifest,
} from '../../../packages/protocol/schemas.ts';

export interface VitPoseExtractor {
  extractFromClip(
    clip: VideoClipManifest,
    options?: {async?: boolean},
  ): Promise<Pose2DKeypoints>;
}
