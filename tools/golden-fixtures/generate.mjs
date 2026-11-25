// All golden fixtures as relative path -> file content (3D-07). Pure: reads only the source documents.

import { importCases } from './cases-import.mjs';
import { roofCases } from './cases-roof.mjs';
import { editCases } from './cases-edit.mjs';
import { envelopeCases } from './cases-envelope.mjs';
import { serviceCases } from './cases-service.mjs';
import { render } from './fixture.mjs';
import { readSpec13, readV03 } from './source.mjs';

/** Every fixture definition, in spec §13 order. */
export function definitions() {
  const order = [...readSpec13().keys()];
  const defs = [...importCases(), ...roofCases(), ...editCases(), ...envelopeCases(), ...serviceCases()];
  return defs.sort((a, b) => order.indexOf(a.gt) - order.indexOf(b.gt));
}

/** @returns {Map<string, string>} */
export function generate() {
  const v03 = readV03();
  const spec13 = readSpec13();
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const def of definitions()) {
    for (const [path, content] of render(def, v03, spec13)) {
      if (out.has(path)) throw new Error(`duplicate fixture file ${path}`);
      out.set(path, content);
    }
  }
  return out;
}
