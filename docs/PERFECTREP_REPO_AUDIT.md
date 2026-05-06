# PerfectRep Repository Audit

## Scope

Audited repository: `AndrewBoessen/PerfectRep` (cloned locally as `PerfectRep-audit`).

This audit classifies repository components and documents the exact inference boundary needed for RepTile MVP migration.

## High-Level Conclusion

- PerfectRep is a **2D-to-3D lifter** around `DSTformer`, not a 2D detector.
- `infer_wild.py` expects a **precomputed keypoint JSON** and does not run ViTPose internally.
- `train.py` trains the **2D-to-3D model** on Fit3D-formatted data.
- MVP can use a pretrained checkpoint and skip all training/preprocessing scripts.

## File/Module Classification

### Inference-only (runtime needed for 2D-to-3D lifting)

- `infer_wild.py`
- `src/data/dataset_wild.py`
- `src/model/DSTformer.py`
- `src/utils/vismo.py`
- `src/utils/data.py` (normalization helpers)
- `src/utils/tools.py` (`get_config`)

### Training-only (not needed for MVP inference path)

- `train.py` (core 2D-to-3D training/eval loop)
- `src/data/dataset_motion_3d.py`
- `src/data/datareader_fit3d.py`
- `src/data/augmentation.py`
- `src/model/loss.py`
- `src/utils/training.py`
- `train_config.yaml` / `ft_3d_pose_config.yaml` (training configs)

### Action-classification training-only (separate track)

- `train_action.py`
- `src/data/dataset_action.py`
- `src/model/action_model.py`
- `action_config.yaml`

### Preprocessing-only (dataset preparation)

- `compress_fit3d.py`
- `process_fit3d.py`
- `process_fit3d_action.py`

### Visualization-only / analysis helpers

- `src/utils/vismo.py` (skeleton render to MP4)
- `src/analysis/rep_segmentation.py`
- `docs/form-analysis.md`

## `infer_wild.py` Contract (Exact Observed Behavior)

## CLI arguments

- `--config` (default `train_config.yaml`)
- `--checkpoint` path to checkpoint with `model` state dict
- `--video` path to source video
- `--json_path` path to keypoint json
- `--out_path` output directory
- optional: `--pixel`, `--focus` (focus not actually used in `dataset_wild.py`)

Note: `--image` exists but the script always opens `args.video`; image mode is effectively unimplemented.

## Required JSON input format

Observed in `src/data/dataset_wild.py`:

1. Loads json via `json.load`.
2. Reads `results['keypoints']`.
3. Reshapes into `[-1, 17, 3]`.

So minimum expected shape is:

- Top-level object containing key `keypoints`
- `keypoints` is a flattened numeric array with length `num_frames * 17 * 3`
- Per joint: `[x, y, confidence]`

Then the code:

- flips XY order with `kpts[..., :2] = kpts[..., :2][..., ::-1]`
- maps COCO-17 joints to Human3.6M-17 via `coco2h36m`
- normalizes either:
  - to video pixel-centered space (`--pixel`)
  - or to normalized `[-1, 1]` crop scale (default path)

## Output artifacts

Always writes to `out_path`:

- `X3D.mp4`: rendered 3D skeleton animation (`render_and_save`)
- `X3D.npy`: numpy array of predicted 3D keypoints, shape approximately `[T, 17, 3]`

Additional behavior:

- Root depth anchor applied per batch: `predicted_3d_pos[:,0,0,2] = 0`
- With `--pixel`, output array is transformed back to video pixel coordinate frame for x/y scaling.

## ViTPose Integration Boundary

PerfectRep does **not** call ViTPose anywhere in Python code.

Evidence:

- README says: "Use ViTPose ... save frame keypoints in a json file."
- `infer_wild.py` only consumes `--json_path`.
- no import/invocation of ViTPose modules in repository.

Therefore, ViTPose is an **external producer** and PerfectRep is a **downstream consumer**.

## What `train.py` Trains

`train.py` trains `DSTformer` to map 2D motion sequences to 3D motion sequences:

- Input: `(T, 17, 3)` 2D-like skeleton tensor (x, y, conf)
- Output: `(T, 17, 3)` 3D keypoints
- Losses: MPJPE + scale + velocity (+ optional limb/angle terms)
- Dataset path defaults to preprocessed Fit3D clips (`data/motion3d/...`)

It does **not** train ViTPose or any 2D keypoint detector.

## Pretrained Checkpoint Feasibility

Repo supports loading checkpoint directly in inference:

- `infer_wild.py` loads checkpoint and calls `model_backbone.load_state_dict(checkpoint['model'], strict=True)`

For RepTile MVP, this means:

- no training required to demonstrate end-to-end packet flow
- can produce 3D outputs using pretrained `best_epoch.bin` and external/mock 2D keypoints

## Risks / Gaps to Account For

- Input json contract is loosely documented; recommend strict adapter validation before calling Python.
- `--image` argument appears stale or incomplete.
- Joint-index mapping must remain explicit (COCO-17 -> H36M-17).
- Python deps + model runtime are heavy; keep outside Athlete Node and behind Coach-side adapter.

