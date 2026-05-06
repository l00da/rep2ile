/**
 * PerfectRep bridge environment for the **coach Node**: your **local laptop**
 * running Node (not a remote server or cloud coach). `infer_wild.py` is spawned
 * as a subprocess against paths on this machine. The athlete Node is the
 * phone/browser; the relay routes packets between them (LAN or ngrok).
 *
 * Inference stays OFF unless `PERFECTREP_ENABLED=true`. Repo/output defaults are
 * ordinary desktop paths under your home directory — not container paths.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Default clone location on a dev laptop (`~/PerfectRep`). */
export const DEFAULT_PERFECTREP_REPO_PATH = path.join(
  os.homedir(),
  'PerfectRep',
);

/** Default scratch dir for inference outputs (`~/.reptile/perfectrep-output`; `.npy` always, `.mp4` only with video). */
export const DEFAULT_PERFECTREP_OUTPUT_DIR = path.join(
  os.homedir(),
  '.reptile',
  'perfectrep-output',
);

export type PerfectRepEnv = {
  enabled: boolean;
  repoPath: string;
  checkpointPath: string;
  outputDir: string;
  /**
   * Used as `--fps` for patched infer_wild.py JSON-only mode.
   */
  inferFps: number;
  pythonExecutable: string;
};

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function getPerfectRepEnv(): PerfectRepEnv {
  const repoFromEnv = process.env.PERFECTREP_REPO_PATH?.trim();
  const outFromEnv = process.env.PERFECTREP_OUTPUT_DIR?.trim();
  const repoPath = repoFromEnv || DEFAULT_PERFECTREP_REPO_PATH;
  const checkpointFromEnv = process.env.PERFECTREP_CHECKPOINT_PATH?.trim();
  const fpsRaw = parseFloat(process.env.PERFECTREP_INFER_FPS ?? '30');
  const inferFps =
    Number.isFinite(fpsRaw) && fpsRaw > 0 ? fpsRaw : 30;
  return {
    enabled: truthyEnv('PERFECTREP_ENABLED'),
    repoPath,
    checkpointPath:
      checkpointFromEnv || path.join(repoPath, 'best_epoch.bin'),
    outputDir: outFromEnv || DEFAULT_PERFECTREP_OUTPUT_DIR,
    inferFps,
    pythonExecutable:
      process.env.PERFECTREP_PYTHON?.trim() ||
      process.env.PYTHON?.trim() ||
      'python3',
  };
}

export function describePerfectRepEnvIssues(env: PerfectRepEnv): string[] {
  const issues: string[] = [];
  if (!fs.existsSync(env.repoPath)) {
    issues.push(
      `PERFECTREP_REPO_PATH resolved to ${env.repoPath} but that directory does not exist`,
    );
  }
  if (!fs.existsSync(path.join(env.repoPath, 'infer_wild.py'))) {
    issues.push(
      `infer_wild.py not found in ${env.repoPath} (apply patches/perfectrep/infer_wild.py)`,
    );
  }
  if (!fs.existsSync(env.checkpointPath)) {
    issues.push(`Checkpoint not found at ${env.checkpointPath}`);
  }
  if (path.basename(env.checkpointPath) !== 'best_epoch.bin') {
    issues.push(
      `Expected best_epoch.bin for MVP bridge, got ${path.basename(env.checkpointPath)}`,
    );
  }
  return issues;
}

export function validatePerfectRepStartup(env: PerfectRepEnv): {
  ok: boolean;
  issues: string[];
} {
  const issues = describePerfectRepEnvIssues(env);
  return {ok: issues.length === 0, issues};
}
