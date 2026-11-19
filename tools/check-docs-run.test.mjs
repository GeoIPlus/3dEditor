// Branch rule of `npm run check:docs` (D-38). The document checks themselves are tested in check-docs.test.mjs.
import { describe, expect, it } from 'vitest';
import { allowProvisional, currentBranch } from './check-docs-run.mjs';

describe('check:docs branch rule', () => {
  it('allows provisional ids only on wp/* branches or with the flag', () => {
    expect(allowProvisional('wp/3d-05-bootstrap', [])).toBe(true);
    expect(allowProvisional('claude/keen-pascal-u7z2gk', [])).toBe(false);
    expect(allowProvisional('main', [])).toBe(false);
    expect(allowProvisional('', [])).toBe(false);
    expect(allowProvisional('claude/some-platform-branch', ['--allow-provisional'])).toBe(true);
  });

  it('takes the PR head branch, then the pushed ref, from CI variables', () => {
    expect(currentBranch({ GITHUB_HEAD_REF: 'wp/3d-09-brep-core', GITHUB_REF_NAME: '12/merge' }, '.')).toBe('wp/3d-09-brep-core');
    expect(currentBranch({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'claude/keen-pascal-u7z2gk' }, '.')).toBe('claude/keen-pascal-u7z2gk');
  });
});
