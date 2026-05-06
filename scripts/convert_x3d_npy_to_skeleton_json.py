#!/usr/bin/env python3
"""
Convert PerfectRep X3D.npy (shape T×17×3) to RepTile skeleton_3d_sequence JSON.

Rows in the array follow PerfectRep Human3.6M layout; output uses MS COCO `coco_17`
index order and `normalized_n11` coordinates ([-1,1], infer_wild without --pixel).

Usage:
  python3 scripts/convert_x3d_npy_to_skeleton_json.py path/to/X3D.npy [fps] > out.json

Requires: numpy

Output validates against packages/protocol/schemas skeleton_3d_sequence (JSON).
"""

from __future__ import annotations

import json
import sys


def clamp_n11(v: float) -> float:
    return max(-1.0, min(1.0, v))


def h36m_frame_to_coco17_wire(h):
    """Match coach-node/perfectrep/convertPerfectRepX3DToSkeletonSequence.ts."""
    head = h[10]
    return [
        h[9],
        head,
        head,
        head,
        head,
        h[11],
        h[14],
        h[12],
        h[15],
        h[13],
        h[16],
        h[4],
        h[1],
        h[5],
        h[2],
        h[6],
        h[3],
    ]


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: convert_x3d_npy_to_skeleton_json.py <X3D.npy> [fps]", file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    fps = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0

    import numpy as np

    arr = np.load(path)
    if arr.ndim != 3 or arr.shape[1] != 17 or arr.shape[2] != 3:
        raise SystemExit(
            f"Expected shape (T,17,3), got {arr.shape} from {path}"
        )

    frames_out = []
    for frame_index in range(arr.shape[0]):
        ts = int(round((frame_index * 1000.0) / fps))
        h = [arr[frame_index, j].tolist() for j in range(17)]
        wire = h36m_frame_to_coco17_wire(h)
        joints = []
        for joint_index in range(17):
            x, y, z = wire[joint_index]
            joints.append(
                {
                    "joint_index": joint_index,
                    "x": clamp_n11(float(x)),
                    "y": clamp_n11(float(y)),
                    "z": clamp_n11(float(z)),
                }
            )
        frames_out.append(
            {
                "frame_index": frame_index,
                "timestamp_ms": ts,
                "joints": joints,
            }
        )

    payload = {
        "schema_version": "1.0.0",
        "joint_schema": "coco_17",
        "coordinate_space": "normalized_n11",
        "frames": frames_out,
    }
    json.dump(payload, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
