import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import type {Skeleton3DSequence} from '../../packages/protocol/schemas';

const CANVAS = 220;
const PAD = 16;

/**
 * MS COCO 17 body keypoint limb pairs (`joint_index` matches `coco_17` — nose, eyes,
 * ears, shoulders, elbows, wrists, hips, knees, ankles).
 */
const COCO17_LIMBS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

type Props = {
  sequence: Skeleton3DSequence | null;
  frameIntervalMs?: number;
};

/**
 * Renders a 2D projection of the coach `skeleton_3d_sequence`.
 *
 * **Coordinate contract (do not “fix” without updating the protocol):** sequences use
 * `coordinate_space: normalized_n11` — each joint **x, y, z** is in **[-1, 1]** model space
 * (PerfectRep `infer_wild` **without** `--pixel`). We map **x,y** from that fixed range into
 * canvas pixels **here at draw time** using a constant scale. Do **not** normalize by the
 * sequence min/max bbox upstream — that would destroy the [-1,1] contract and hide drift bugs.
 */
export function Skeleton3DReplay({
  sequence,
  frameIntervalMs = 420,
}: Props) {
  const [frameIndex, setFrameIndex] = useState(0);

  const frameCount = useMemo(
    () => sequence?.frames.length ?? 0,
    [sequence?.frames.length],
  );

  useEffect(() => {
    if (!frameCount) {
      return undefined;
    }
    const id = setInterval(() => {
      setFrameIndex(i => (i + 1) % frameCount);
    }, frameIntervalMs);
    return () => clearInterval(id);
  }, [sequence, frameIntervalMs, frameCount]);

  useEffect(() => {
    setFrameIndex(0);
  }, [sequence]);

  if (!sequence?.frames.length || !frameCount) {
    return (
      <View style={styles.placeholder} testID="skeleton-replay-root">
        <Text style={styles.placeholderText}>No skeleton sequence yet.</Text>
      </View>
    );
  }

  const frame = sequence.frames[frameIndex];
  const inner = CANVAS - PAD * 2;

  /** Map normalized x,y ∈ [-1, 1] to canvas pixels (fixed range — not data-dependent). */
  function projectNormalized(jx: number, jy: number): {x: number; y: number} {
    const x = PAD + ((jx + 1) / 2) * inner;
    const y = PAD + ((1 - jy) / 2) * inner;
    return {x, y};
  }

  return (
    <View style={styles.wrap} testID="skeleton-replay-root">
      <Text style={styles.frameLabel} testID="skeleton-replay-frame-label">
        Frame {frameIndex + 1} / {sequence.frames.length} (normalized x/y → canvas)
      </Text>
      <View style={styles.canvas} testID="skeleton-replay-canvas">
        {COCO17_LIMBS.map(([a, b], i) => {
          const ja = frame.joints[a];
          const jb = frame.joints[b];
          const pa = projectNormalized(ja.x, ja.y);
          const pb = projectNormalized(jb.x, jb.y);
          const dx = pb.x - pa.x;
          const dy = pb.y - pa.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const angleRad = Math.atan2(dy, dx);
          const angleDeg = (angleRad * 180) / Math.PI;
          return (
            <View
              key={`limb-${i}`}
              style={[
                styles.limb,
                {
                  left: pa.x,
                  top: pa.y - 1,
                  width: len,
                  transform: [{rotate: `${angleDeg}deg`}],
                },
              ]}
            />
          );
        })}
        {frame.joints.map(j => {
          const p = projectNormalized(j.x, j.y);
          return (
            <View
              key={`j-${j.joint_index}`}
              style={[
                styles.joint,
                {left: p.x - 4, top: p.y - 4},
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {marginTop: 8},
  frameLabel: {fontSize: 12, marginBottom: 6, color: '#444'},
  canvas: {
    width: CANVAS,
    height: CANVAS,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fafafa',
    position: 'relative',
    overflow: 'hidden',
  },
  limb: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#888',
  },
  joint: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007aff',
  },
  placeholder: {padding: 12},
  placeholderText: {color: '#888'},
});
