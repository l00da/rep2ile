# PerfectRep Migration Plan for RepTile

## Target Architecture

- `athlete-node` captures clip + mock IMU, optionally runs async/offline 2D extraction.
- `relay/coordinator` routes packets and exposes lifecycle observability.
- `coach-node` consumes `form_sample`, returns toy feedback now, and later PerfectRep-backed 3D output.

## Proposed Repo Layout

```
athlete-node/
  vision/
    vitpose/
      VitPoseExtractor.ts
      FixturePose2DExtractor.ts
      loadCoco17PoseFixture.ts
fixtures/
  pose2d/
    coco17_squat_tiny.json
coach-node/
  perfectrep/
    PerfectRep3DLifter.ts
    MockPerfectRep3DLifter.ts
packages/
  protocol/
    schemas.ts
```

## Boundary Decisions (MVP-safe)

- Athlete Node does **not** require real-time ViTPose.
- Athlete Node may submit:
  - only clip + IMU for first pass, or
  - clip + optional async `pose2d_keypoints`.
- Coach Node must accept packet even when 2D keypoints are mock or absent.
- PerfectRep integration is hidden behind `PerfectRep3DLifter` interface.

## Data Contract Mapping

## ViTPose / COCO -> `pose2d_keypoints`

- Source expected by PerfectRep path: COCO-17 `[x, y, confidence]` per frame.
- RepTile packet format should store:
  - `frame_index`, `timestamp_ms`
  - `keypoints` array length 17 with named/ordered joints
  - confidence score per joint
- Keep coordinate metadata explicit:
  - `coordinate_space`: `pixel` or `normalized`
  - `frame_width`, `frame_height`

## PerfectRep `X3D.npy` -> `skeleton_3d_sequence`

- Parse numpy output to frames of 17 joints.
- Preserve joint order as Human3.6M-17.
- Emit JSON:
  - `frames[]` with `frame_index`, `timestamp_ms`, `joints[] {x,y,z}`
  - `joint_schema: "human36m_17"`
  - `coordinate_space: "model_normalized"` (or `"pixel_aligned"` if using `--pixel`)

## Phased Delivery

## Phase 0 - Protocol + fixture-backed mocks (now)

- Add protocol schemas in `packages/protocol/schemas.ts`.
- Add adapters:
  - `FixturePose2DExtractor` (reads deterministic COCO-17 fixture)
  - `MockPerfectRep3DLifter`
- Add fixture `fixtures/pose2d/coco17_squat_tiny.json` with top-level `keypoints` and length divisible by `17*3`.
- Coach response includes toy feedback + fake 3D sequence.

Exit criteria:

- End-to-end JSON packet flow works across athlete -> relay -> coach.
- Relay logs complete message lifecycle metadata.

## Phase 1 - Async 2D extraction boundary

- Add Athlete-side job flow for offline extraction.
- Keep extractor interface stable; implementation remains mock first.
- Add packet versioning and `processing_state` markers.

Exit criteria:

- Same `form_sample` schema supports both mock and real extractor sources.

## Phase 2 - Real PerfectRep inference on Coach

- Implement Python runner wrapper for `infer_wild.py`.
- Inputs:
  - video path
  - keypoint json path
  - checkpoint path
- Outputs:
  - parse `X3D.npy` to `skeleton_3d_sequence`
  - optional artifact ref to rendered `X3D.mp4`

Exit criteria:

- Coach returns real 3D sequence while preserving existing JSON contract.

## Phase 3 - Quality and training decisions

- Start with pretrained checkpoint only.
- Trigger training only when domain shift is evident (camera angles, exercise variants, populations, metrics drift).
- If needed:
  - fine-tune first (`ft_3d_pose_config.yaml` path)
  - full training only after data volume and labeling are sufficient.

## Direct Answers to Key Questions

- **What does `train.py` train?**  
  The PerfectRep 2D-to-3D DSTformer model (not ViTPose).

- **When is training necessary?**  
  When pretrained performance is inadequate for your camera setup/domain and accuracy targets.

- **What can pretrained checkpoints do now?**  
  Run inference from external 2D keypoints and produce `X3D.npy` + `X3D.mp4`.

- **Minimum passing demo without training?**  
  Athlete sends `form_sample` with fixture-derived `pose2d_keypoints` + mock IMU through relay; coach returns toy feedback + mock 3D sequence using mock lifter interface (optionally swap in pretrained PerfectRep later without protocol changes).

## Relay Observability Requirements

For every routed message:

- `message_id`
- `session_id`
- `sender_node_id`
- `receiver_node_id`
- `created_at`, `forwarded_at`, `ack_at` (as available)
- `status` (`received | queued | forwarded | processed | failed`)
- `payload_preview` (truncated safe JSON)

All fields must remain JSON-serializable and safe to log.

