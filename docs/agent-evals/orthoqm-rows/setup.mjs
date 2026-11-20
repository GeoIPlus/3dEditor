import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @param {{work: string}} c */
export default ({ work }) => {
  const sc = join(work, '..', 'shared_compnents');
  mkdirSync(join(sc, 'docs'), { recursive: true });
  writeFileSync(join(sc, 'AGENTS.md'), '# AGENTS.md - shared_compnents\n\nOrthoQM rows are owned by the OrthoQM team. 3DQM sessions edit only rows marked `3DQM`.\n');
  writeFileSync(join(sc, 'docs', 'BACKLOG.md'), `# BACKLOG - shared_compnents

| Id | Title | Product | Status |
|---|---|---|---|
| WP-12 | OrthoQM mosaic seamline tool | OrthoQM | review |
| WP-21 | 3DQM plans/3dqm production and qa plans | 3DQM | ready |
`);
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=e@l', '-c', 'user.name=e', 'commit', '-q', '-m', 'init']])
    execFileSync('git', a, { cwd: sc });
};
