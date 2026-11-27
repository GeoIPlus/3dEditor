// Isolated images of check:arch (3D-74; 3D-ADR-0008, D-109, D-148): a program under a licence outside the allow-list
// (val3dity, GPL-3.0) lives in its own image directory and is reached over the network only. The rule keeps it out of
// the kernel and the service: no npm package inside the directory (it cannot become a runtime dependency that the
// 3D-67 licence check would have to admit), no import into it from code under `packages/` or `services/`, and the
// image carries its licence and source notice (SOURCE.md) next to its Dockerfile. A tree without the directory has
// nothing to check.
import { posix } from 'node:path';
import { isCode } from './scan.mjs';

/** @typedef {import('./rules.mjs').Ctx} Ctx */

const RULE = '3D-ADR-0008, D-109';

/** @param {Ctx} ctx @returns {string[]} */
export function isolatedImages(ctx) {
  /** @type {string[]} */
  const out = [];
  for (const { dir, licence } of ctx.config.isolatedImages) {
    const inside = (/** @type {string} */ f) => f === dir || f.startsWith(`${dir}/`);
    if (!ctx.files.some(inside)) continue; // no such image in this tree (planted trees of other tests)
    for (const need of ['Dockerfile', 'SOURCE.md']) {
      if (!ctx.files.includes(`${dir}/${need}`)) out.push(`${dir}/${need}:1: missing; an isolated ${licence} image carries its build and source notice (${RULE})`);
    }
    for (const f of ctx.files.filter(inside)) {
      if (posix.basename(f) === 'package.json') out.push(`${f}:1: npm package inside the isolated ${licence} image ${dir} (${RULE})`);
    }
    for (const f of ctx.files) {
      if (!/^(packages|services)\//.test(f) || !isCode(f, ctx.config.codeExtensions)) continue;
      for (const imp of ctx.parsed(f).imports) {
        if (!imp.specifier.startsWith('.')) continue;
        const target = posix.normalize(posix.join(posix.dirname(f), imp.specifier));
        if (inside(target)) out.push(`${f}:${imp.line}: imports ${imp.specifier} from the isolated ${licence} image ${dir} (${RULE})`);
      }
    }
  }
  return out;
}
