import { addRow, write } from '../../../tools/agent-evals/scenario.mjs';

/** 2D helper module of ~285 lines: small real functions. */
function module285() {
  const out = ['// 2D geometry helpers for the kernel (scenario file).', ''];
  const ops = [['add', '+'], ['sub', '-'], ['mul', '*']];
  let i = 0;
  while (out.length < 280) {
    const [name, op] = ops[i % ops.length];
    out.push(
      '/**',
      ` * Component-wise ${name} of two 2D points, variant ${i}.`,
      ' * @param {[number, number]} a',
      ' * @param {[number, number]} b',
      ' * @returns {[number, number]}',
      ' */',
      `export function ${name}${i}(a, b) {`,
      `  return [a[0] ${op} b[0], a[1] ${op} b[1]];`,
      '}',
      '',
    );
    i += 1;
  }
  return `${out.join('\n')}\n`;
}

/** @param {{work: string}} c */
export default ({ work }) => {
  write(work, 'packages/geo-model3d/src/geom2d.js', module285());
  addRow(work, {
    id: '3D-96', title: 'Kernel util: 2D segment helpers', modules: 'geo-model3d', deps: '05', size: 'S', status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`segmentLength\`, \`segmentMidpoint\`, \`segmentIntersection\` (null when parallel) for 2D segments, with JSDoc and
  unit tests.
- Accept: unit tests for each function; \`npm run check:arch\` passes.
- Decisions: D-41  Open: -`,
  });
};
