import {execFile} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';

import {
  describePerfectRepEnvIssues,
  getPerfectRepEnv,
  type PerfectRepEnv,
} from './perfectRepEnv';
import {validateCoco17KeypointsJson} from './validateCoco17KeypointsJson';

const execFileAsync = promisify(execFile);

export type DisabledResult = {
  kind: 'disabled';
  message: string;
};

export type PerfectRepRunnerOutcome =
  | DisabledResult
  | {
      kind: 'validation_error';
      message: string;
    }
  | {
      kind: 'config_error';
      messages: string[];
    }
  | {
      kind: 'success';
      x3dNpyPath: string;
      skeletonJsonPath: string;
      outputDir: string;
    }
  | {
      kind: 'inference_error';
      message: string;
      stderr?: string;
      exitCode?: number | null;
    };

function mergeEnv(
  base: PerfectRepEnv,
  override?: Partial<PerfectRepEnv>,
): PerfectRepEnv {
  if (!override) {
    return base;
  }
  return {...base, ...override};
}

/**
 * Experimental bridge to AndrewBoessen/PerfectRep `infer_wild.py`.
 *
 * **Coach Node = your laptop** — runs `infer_wild.py` as a **local subprocess**
 * on your filesystem (no cloud coach deployment required). The athlete Node is
 * the phone/browser; libp2p/relay carries packets over LAN or ngrok.
 *
 * **Node-only** — do not import from the React Native bundle.
 *
 * Uses patched `infer_wild.py` in JSON-only mode:
 * no `-v`, no `--pixel`, outputs `X3D.npy` normalized in [-1, 1].
 * A required second step runs `scripts/convert_x3d_npy_to_skeleton_json.py`
 * to produce schema-valid `skeleton_3d_sequence` JSON.
 */
export class PerfectRepRunner {
  constructor(
    private readonly readEnv: () => PerfectRepEnv = getPerfectRepEnv,
  ) {}

  async run(params: {
    keypointsJsonPath: string;
    envOverride?: Partial<PerfectRepEnv>;
  }): Promise<PerfectRepRunnerOutcome> {
    const env = mergeEnv(this.readEnv(), params.envOverride);

    if (!env.enabled) {
      return {
        kind: 'disabled',
        message:
          'PerfectRep inference is disabled (set PERFECTREP_ENABLED=true after configuring paths).',
      };
    }

    const issues = describePerfectRepEnvIssues(env);
    if (issues.length > 0) {
      return {kind: 'config_error', messages: issues};
    }

    const absJson = path.resolve(params.keypointsJsonPath);
    if (!fs.existsSync(absJson)) {
      return {
        kind: 'validation_error',
        message: `Keypoints JSON not found: ${absJson}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(absJson, 'utf-8'));
    } catch (e) {
      return {
        kind: 'validation_error',
        message: `Invalid JSON file: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const validation = validateCoco17KeypointsJson(parsed);
    if (!validation.ok) {
      return {kind: 'validation_error', message: validation.message};
    }

    const repoRoot = path.resolve(env.repoPath);
    const inferScript = path.join(repoRoot, 'infer_wild.py');
    const trainConfig = path.join(repoRoot, 'train_config.yaml');
    const helperScript = path.resolve(
      __dirname,
      '..',
      '..',
      'scripts',
      'convert_x3d_npy_to_skeleton_json.py',
    );

    if (!fs.existsSync(inferScript)) {
      return {
        kind: 'config_error',
        messages: [`infer_wild.py not found at ${inferScript}`],
      };
    }
    if (!fs.existsSync(trainConfig)) {
      return {
        kind: 'config_error',
        messages: [`train_config.yaml not found at ${trainConfig}`],
      };
    }
    const outDir = path.resolve(env.outputDir);
    fs.mkdirSync(outDir, {recursive: true});

    const pyArgs: string[] = [
      inferScript,
      '--config',
      trainConfig,
      '-c',
      path.resolve(env.checkpointPath),
      '--fps',
      String(env.inferFps),
    ];
    // Protocol pins normalized [-1,1] (`normalized_n11`) — never pass `--pixel` or `-v`.
    pyArgs.push('-j', absJson, '-o', outDir);

    try {
      await execFileAsync(env.pythonExecutable, pyArgs, {
        cwd: repoRoot,
        maxBuffer: 64 * 1024 * 1024,
        env: {...process.env},
      });
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException & {
        stderr?: Buffer;
        code?: string | number | null;
      };
      const stderr = err.stderr?.toString?.();
      const exitCode =
        typeof err.code === 'number'
          ? err.code
          : typeof err.code === 'string'
            ? parseInt(err.code, 10)
            : null;
      return {
        kind: 'inference_error',
        message: err.message ?? 'infer_wild.py failed',
        stderr,
        exitCode: Number.isNaN(exitCode as number) ? null : exitCode,
      };
    }

    const x3dNpyPath = path.join(outDir, 'X3D.npy');
    if (!fs.existsSync(x3dNpyPath)) {
      return {
        kind: 'inference_error',
        message: `Inference finished but X3D.npy missing at ${x3dNpyPath}`,
      };
    }

    if (!fs.existsSync(helperScript)) {
      return {
        kind: 'config_error',
        messages: [`Required helper script not found: ${helperScript}`],
      };
    }
    const skeletonJsonPath = path.join(outDir, 'skeleton_3d_sequence.json');
    try {
      const {stdout} = await execFileAsync(
        env.pythonExecutable,
        [helperScript, x3dNpyPath, String(env.inferFps)],
        {
          cwd: repoRoot,
          maxBuffer: 64 * 1024 * 1024,
          env: {...process.env},
        },
      );
      fs.writeFileSync(skeletonJsonPath, stdout);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException & {stderr?: Buffer};
      return {
        kind: 'inference_error',
        message: `X3D.npy conversion failed: ${err.message ?? 'unknown error'}`,
        stderr: err.stderr?.toString?.(),
      };
    }

    return {
      kind: 'success',
      x3dNpyPath,
      skeletonJsonPath,
      outputDir: outDir,
    };
  }
}
