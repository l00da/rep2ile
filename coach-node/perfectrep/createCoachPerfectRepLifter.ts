import type {PerfectRep3DLifter} from './PerfectRep3DLifter';
import {getPerfectRepEnv, validatePerfectRepStartup} from './perfectRepEnv';
import {MockPerfectRep3DLifter} from './MockPerfectRep3DLifter';

/**
 * Coach-side 3D lifter for demos and relays on **your local laptop** (the coach
 * peer is not modeled as a hosted server). Defaults to mock so the walkthrough
 * never depends on Python or a PerfectRep clone.
 *
 * When `PERFECTREP_ENABLED` is false (default), external inference must not run;
 * this returns {@link MockPerfectRep3DLifter}. A future `FormSample` →
 * {@link PerfectRepRunner} pipeline may swap implementations while keeping the
 * same interface.
 */
export function createCoachPerfectRepLifter(): PerfectRep3DLifter {
  const env = getPerfectRepEnv();
  if (!env.enabled) {
    return new MockPerfectRep3DLifter();
  }
  const startup = validatePerfectRepStartup(env);
  if (!startup.ok) {
    console.error(
      `[PerfectRep] bridge disabled at startup; using mock lifter. ${startup.issues.join(
        ' | ',
      )}`,
    );
    return new MockPerfectRep3DLifter();
  }
  // Real runner-backed lifter remains opt-in and isolated in this pass.
  return new MockPerfectRep3DLifter();
}
