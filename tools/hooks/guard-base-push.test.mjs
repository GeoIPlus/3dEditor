// Planted pushes for the base-branch guard (3D-78, D-178).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCoordinator, pushToBase } from './guard-base-push.mjs';

const BASE = 'claude/keen-pascal-u7z2gk';
const on = (/** @type {string} */ branch) => () => branch;

describe('guard-base-push', () => {
  it('refuses every form that writes the base', () => {
    for (const cmd of [
      `git push -u origin ${BASE}`,
      `git push origin HEAD:${BASE}`,
      `git push origin wp/3d-78-x:refs/heads/${BASE}`,
      `git push origin +${BASE}`,
      `git push --delete origin ${BASE}`,
      'git push --all origin',
      `cd /repo && git -C /repo push origin "${BASE}"`,
    ]) expect(pushToBase(cmd, BASE, on('wp/3d-78-x')), cmd).not.toBe('');
    expect(pushToBase('git push', BASE, on(BASE))).toMatch(/bare/);
    expect(pushToBase('git push origin HEAD', BASE, on(BASE))).not.toBe('');
  });

  it('allows the own branch and unrelated commands', () => {
    for (const cmd of [
      'git push -u origin wp/3d-78-single-writer',
      'git push origin HEAD',
      'git push',
      `git fetch origin ${BASE}`,
      `git log origin/${BASE} && echo push`,
    ]) expect(pushToBase(cmd, BASE, on('wp/3d-78-single-writer')), cmd).toBe('');
  });

  it('knows the coordinator only by a marker holding its own session id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-'));
    try {
      const file = join(dir, 'marker');
      const env = { THREEDQM_COORDINATOR_MARKER: file, CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01ABC' };
      expect(isCoordinator(env)).toBe(false);
      writeFileSync(file, 'session_01ABC\n');
      expect(isCoordinator(env)).toBe(true);
      expect(isCoordinator({ ...env, CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01XYZ' })).toBe(false);
      expect(isCoordinator({ THREEDQM_COORDINATOR_MARKER: file })).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
