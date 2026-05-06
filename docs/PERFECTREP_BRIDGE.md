# PerfectRep Bridge (experimental)

Isolated bridge from RepTile to [AndrewBoessen/PerfectRep](https://github.com/AndrewBoessen/PerfectRep) `infer_wild.py`. The main app demo continues to use **`MockPerfectRep3DLifter`** — no runtime dependency on Python unless you explicitly enable this bridge.

## Architecture (coach vs athlete)

| Role | Where it runs |
|------|----------------|
| **Athlete Node** | Phone or browser — captures clip / pose packets and sends them through the relay. |
| **Coach Node** | **Your local laptop** — runs Node and, when enabled, spawns **PerfectRep on the same machine** (`infer_wild.py` as a subprocess against paths on your disk). Not a remote server or second phone. |
| **Relay** | Routes traffic between athlete and coach over **local network** or **ngrok** (or similar); no requirement that the coach runs in the cloud. |

## Why coach-node side

- Inference uses PyTorch + large checkpoints and reads/writes artifacts on disk beside your checkout.
- Keeps the athlete mobile bundle small — no Python on the phone.
- **No cloud deployment** is required for MVP: the coach peer is your laptop; protocol schemas stay the same if you later add a hosted coach.

## Why training is not required for MVP

- `infer_wild.py` loads a **pretrained checkpoint** (`best_epoch.bin` or your own) and runs 2D→3D lifting.
- `train.py` fine-tunes or trains from scratch only when you need domain adaptation — not needed to validate the pipeline.

## `skeleton_3d_sequence` contract (pinned)

Defined in `packages/protocol/schemas.ts` (`skeleton3dSequenceSchema`):

- **`coordinate_space`: `normalized_n11`** — each joint **x, y, z** is in **[-1, 1]** (matches PerfectRep `infer_wild` **without** `--pixel`). The RepTile bridge **does not** pass `--pixel`; 3D pixel space is out of contract.
- **Axes** — **x** = horizontal (right +), **y** = vertical (up + in model space), **z** = depth (toward camera +; confirm in your viewer).
- **`joint_schema`: `coco_17`** — MS COCO body keypoint order (same index semantics as 2D `pose2d_keypoints` with `coco_17`).

`X3D.npy` is stored in the model’s **Human3.6M** row order; `convertPerfectRepX3DToSkeletonSequence` and `scripts/convert_x3d_npy_to_skeleton_json.py` **reorder to `coco_17`** for the wire format. **Do not** pre-scale coordinates for display in the protocol — **Skeleton3DReplay** maps `[-1,1]` to canvas pixels at render time.

## Video-free inference mode (required)

RepTile bridge runs patched `infer_wild.py` in **JSON-only mode**:

- input: COCO-17 keypoints JSON
- flags: `--fps` (default 30), **no `--video`**, **no `--pixel`**
- output: **`X3D.npy` only**

The athlete does not upload a video file to the coach laptop; the phone renders skeleton animation from `skeleton_3d_sequence` JSON.

Apply the **tracked patch** before relying on JSON-only runs:

1. Back up your clone’s `infer_wild.py`.
2. Copy the patched script from this repo into your PerfectRep checkout root:

```bash
cp patches/perfectrep/infer_wild.py "$PERFECTREP_REPO_PATH/infer_wild.py"
```

This bridge intentionally does not use the legacy render path.

## Environment variables

Unset vars use **local laptop defaults** (under your home directory), not container paths:

| Variable | Default when unset | Purpose |
|----------|-------------------|---------|
| `PERFECTREP_ENABLED` | off (`false`) | Must be `true` to spawn Python. |
| `PERFECTREP_REPO_PATH` | `~/PerfectRep` | Clone containing patched `infer_wild.py`, `train_config.yaml`, `src/`. |
| `PERFECTREP_CHECKPOINT_PATH` | `$PERFECTREP_REPO_PATH/best_epoch.bin` | Checkpoint path. MVP startup validation requires `best_epoch.bin` to exist. |
| `PERFECTREP_OUTPUT_DIR` | `~/.reptile/perfectrep-output` | Writable directory for `X3D.npy` and converted `skeleton_3d_sequence.json`. |
| `PERFECTREP_INFER_FPS` | `30` | Passed to `infer_wild.py --fps` in JSON-only mode. |
| `PERFECTREP_PYTHON` | `python3` | Python executable on the laptop. |

If `PERFECTREP_ENABLED` is not true, `PerfectRepRunner` returns `{ kind: 'disabled', ... }` and never executes Python.

## Expected input JSON (COCO-17)

Matches PerfectRep wild dataset reader:

- Top-level object with **`keypoints`**: flat `number[]` of length **`frames × 17 × 3`**.
- Per joint: **`x`, `y`, `confidence`** (three numbers per joint).

Example: see `fixtures/pose2d/coco17_squat_tiny.json`.

Validation helper: `coach-node/perfectrep/validateCoco17KeypointsJson.ts`.

## Expected outputs

- **`X3D.npy`** — numpy array `(T, 17, 3)`.
- **`skeleton_3d_sequence.json`** — required converted JSON matching protocol schema.

Both are written under `PERFECTREP_OUTPUT_DIR` (default `~/.reptile/perfectrep-output`).

## Required conversion step

`X3D.npy` is not consumed directly by the app. The bridge **must** run the helper:

```bash
python3 scripts/convert_x3d_npy_to_skeleton_json.py "$HOME/.reptile/perfectrep-output/X3D.npy" 30 > "$HOME/.reptile/perfectrep-output/skeleton_3d_sequence.json"
```

Use the same FPS as **`PERFECTREP_INFER_FPS`** when you ran inference without video.

Then parse/validate with `parseSkeletonSequenceJson(JSON.parse(...))` from `convertPerfectRepX3DToSkeletonSequence.ts`.

## Failure modes

- **Disabled** — bridge short-circuits; keep using mock coach.
- **Validation** — malformed `keypoints` length or non-numeric values.
- **Config** — invalid local clone path, missing patched `infer_wild.py`, missing `best_epoch.bin`.
- **Inference** — Python exits non-zero (CUDA OOM, missing deps, bad checkpoint).
- **Missing artifact** — `X3D.npy` missing, or conversion helper fails to produce schema JSON.

## Code entry points

- `coach-node/perfectrep/PerfectRepRunner.ts` — validates JSON, optionally runs `infer_wild.py`.
- `coach-node/perfectrep/convertPerfectRepX3DToSkeletonSequence.ts` — maps arrays → `skeleton_3d_sequence`.
- `scripts/convert_x3d_npy_to_skeleton_json.py` — `.npy` → JSON for Zod validation in Node.
- `patches/perfectrep/infer_wild.py` — drop-in patch for the PerfectRep repo.

## Setup (on your laptop)

1. Clone PerfectRep (e.g. to `~/PerfectRep`) and install Python deps / PyTorch per upstream README.
2. **Install the patched `infer_wild.py`** (see [Video-free inference mode](#video-free-inference-mode-reptile-default-path)).
3. Download a checkpoint (e.g. `best_epoch.bin`) from the upstream README link.
4. Ensure `best_epoch.bin` exists in the clone root (or set `PERFECTREP_CHECKPOINT_PATH` to that file), optionally set `PERFECTREP_INFER_FPS`, then set `PERFECTREP_ENABLED=true`.
5. Call `new PerfectRepRunner().run({ keypointsJsonPath: '/path/to/keypoints.json' })` from a **local Node script or coach CLI on the laptop** — not from the React Native UI bundle on the phone.
