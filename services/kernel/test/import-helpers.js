// Helpers of the service import tests (3D-133): a handler with no baseline over one memory store, the store sources
// adapter on the same store, memory buildings, memory datasets holding the GT-I1 input, and the import request.
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createMemoryBuildings } from '../src/adapters/memory-buildings.js';
import { createStoreSources } from '../src/adapters/store-sources.js';
import { PROFILE, readFixture } from './commit-helpers.js';
import { headers, json, post } from './handler-helpers.js';
import { bUrl, lease, qcHandler } from './qc-helpers.js';

export const P = 'prj-import';
export const B = 'bld-gt-i1';
export const INPUT = 'ds-input-gt-i1';
export const SAVE = 'ds-save-gt-i1';
/** GT-I1 step `toleranceProfile: default`: the profile with its id (the kernel import needs one for the model). */
export const PROFILE_DEFAULT = Object.freeze({ id: 'default', ...PROFILE });
export const gtI1 = () => readFixture('GT-I1', 'input.cityjson.json');

const encoder = new TextEncoder();
/** @param {any} v */
export const bytesOf = (v) => encoder.encode(typeof v === 'string' ? v : JSON.stringify(v));

/**
 * @param {{ saveRef?: string, input?: any, store?: ReturnType<typeof createMemoryStore>,
 *   over?: Partial<import('../src/handler.js').KernelPorts> }} [o] `input: null`: no input dataset
 */
export async function importHandler(o = {}) {
  const store = o.store ?? createMemoryStore();
  const buildings = createMemoryBuildings();
  buildings.set(P, B, { inputRef: INPUT, saveRef: o.saveRef ?? SAVE });
  const sources = createStoreSources(store);
  const h = await qcHandler([], { store, over: { sources, buildings, toleranceProfile: () => PROFILE_DEFAULT, ...o.over } });
  if (o.input !== null) await h.datasets.createDataset(INPUT, bytesOf(o.input ?? gtI1()));
  const leaseHeader = lease(h.leases, { projectId: P, buildingId: B }, 'usr-operator', 1);
  return { ...h, store, buildings, sources, leaseHeader };
}

/** Import request. @param {any} handle @param {string | null} leaseHeader @param {string} [token] @param {any} [body] */
export const importReq = async (handle, leaseHeader, token = 'tok-op', body = {}) =>
  json(await handle(post(bUrl(P, B, 'import'), body, headers(token, leaseHeader))));

/** Records the precondition of every `save` of a datasets port. @param {import('../src/ports/datasets.js').DatasetsPort} datasets */
export function spySaves(datasets) {
  /** @type {any[]} */
  const calls = [];
  const save = datasets.save;
  datasets.save = async (ref, bytes, pre) => { calls.push({ ref, pre }); return save(ref, bytes, pre); };
  return calls;
}
