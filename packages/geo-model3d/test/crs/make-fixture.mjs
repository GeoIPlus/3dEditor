// Generates test/crs/fixtures/gt-i1-epsg4937.cityjson.json from fixtures/GT-I1 (3D-32).
// GT-I1 is in EPSG:25832 (ETRS89 / UTM 32N); its vertices are converted to ETRS89 geographic 3D (EPSG:4937, axis order
// lat, lon, h per EPSG) with proj4's UTM inverse (independent of the kernel's ENU code). Heights are kept (D-93).
// Run: node packages/geo-model3d/test/crs/make-fixture.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const src = JSON.parse(readFileSync(join(root, 'fixtures/GT-I1/input.cityjson.json'), 'utf8'));
const utm = '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs';
const geo = '+proj=longlat +ellps=GRS80 +no_defs';

const SCALE = [1e-8, 1e-8, 0.001];
/** @type {number[][]} */
const world = src.vertices.map((/** @type {number[]} */ v) => {
  const e = v[0] * src.transform.scale[0] + src.transform.translate[0];
  const n = v[1] * src.transform.scale[1] + src.transform.translate[1];
  const h = v[2] * src.transform.scale[2] + src.transform.translate[2];
  const [lon, lat] = proj4(utm, geo, [e, n]);
  return [lat, lon, h]; // EPSG:4937 axis order
});
const translate = [0, 1, 2].map((k) => Math.floor(Math.min(...world.map((w) => w[k])) * 1e4) / 1e4);
const out = {
  ...src,
  transform: { scale: SCALE, translate },
  metadata: { ...src.metadata, referenceSystem: 'https://www.opengis.net/def/crs/EPSG/0/4937' },
  vertices: world.map((w) => [0, 1, 2].map((k) => Math.round((w[k] - translate[k]) / SCALE[k]))),
};
mkdirSync(join(here, 'fixtures'), { recursive: true });
const file = join(here, 'fixtures/gt-i1-epsg4937.cityjson.json');
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(`${file}: ${out.vertices.length} vertices, translate ${translate.join(', ')}`);
