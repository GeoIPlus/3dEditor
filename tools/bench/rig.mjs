// Rig fingerprint printed with every bench result (3D-ADR-0006): what the numbers were measured on.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';

/** @param {string} path */
const readOr = (path) => { try { return existsSync(path) ? readFileSync(path, 'utf8').trim() : null; } catch { return null; } };

export function fingerprint() {
  const cpus = os.cpus();
  let commit = null;
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  return {
    cpuModel: cpus[0]?.model ?? 'unknown',
    logicalCpus: cpus.length,
    cpuMHz: cpus[0]?.speed ?? null,
    cgroupCpuMax: readOr('/sys/fs/cgroup/cpu.max'), // container CPU quota, if any
    memGiB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    node: process.version,
    v8: process.versions.v8,
    loadavg1m: Math.round(os.loadavg()[0] * 100) / 100,
    commit,
  };
}
