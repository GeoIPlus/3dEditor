// Test-only LAS writer (3D-22): builds small LAS files in memory so no binary test data is committed (D-3D22-4).
// Layout per ASPRS LAS 1.4 R15 Table 3; only the fields the reader uses are filled.

/**
 * @param {{ points: number[][], version?: [number, number], format?: number, recordLength?: number,
 *   scale?: number[], offset?: number[], formatByte?: number, legacyCount?: number }} o
 * @returns {Uint8Array}
 */
export function writeLas({ points, version = [1, 2], format = 0, recordLength, scale = [0.001, 0.001, 0.001], offset = [0, 0, 0], formatByte, legacyCount }) {
  const minLen = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67][format];
  const rec = recordLength ?? minLen;
  const headerSize = version[1] >= 4 ? 375 : version[1] === 3 ? 235 : 227;
  const bytes = new Uint8Array(headerSize + rec * points.length);
  const dv = new DataView(bytes.buffer);
  bytes.set([76, 65, 83, 70], 0);
  bytes[24] = version[0];
  bytes[25] = version[1];
  dv.setUint16(94, headerSize, true);
  dv.setUint32(96, headerSize, true);
  bytes[104] = formatByte ?? format;
  dv.setUint16(105, rec, true);
  dv.setUint32(107, legacyCount ?? (format >= 6 ? 0 : points.length), true);
  for (let k = 0; k < 3; k++) {
    dv.setFloat64(131 + 8 * k, scale[k], true);
    dv.setFloat64(155 + 8 * k, offset[k], true);
  }
  if (version[1] >= 4) dv.setBigUint64(247, BigInt(points.length), true);
  points.forEach((p, i) => {
    const at = headerSize + i * rec;
    for (let k = 0; k < 3; k++) dv.setInt32(at + 4 * k, Math.round((p[k] - offset[k]) / scale[k]), true);
  });
  return bytes;
}
