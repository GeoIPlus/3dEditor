// LAS reader (3D-22, interim adapter of D-35 / D-3D22-4): public header block and point XYZ of uncompressed LAS
// 1.0-1.4, point data record formats 0-10. Source: ASPRS LAS Specification 1.4 R15 (2019), Table 3 (header), Tables
// 7-17 (record formats; X Y Z are signed 32-bit integers at bytes 0, 4, 8 of every format). New code, no third-party code.
// Compressed LAZ / COPC is refused: it needs a decoder, a new runtime dependency (D-109) of a later row.

/** Minimum record length per point data record format (LAS 1.4 R15, Tables 7-17). */
export const MIN_RECORD_LENGTH = Object.freeze([20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67]);

export class LasFormatError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'LasFormatError';
  }
}

/**
 * @typedef {object} LasHeader
 * @property {string} version e.g. "1.2"
 * @property {number} pointFormat 0..10
 * @property {number} recordLength bytes per point record
 * @property {number} pointCount
 * @property {number} offsetToPoints
 * @property {[number, number, number]} scale
 * @property {[number, number, number]} offset
 * @property {[number, number, number]} min header bounds (x, y, z)
 * @property {[number, number, number]} max
 */

/**
 * @param {Uint8Array} bytes whole file
 * @returns {LasHeader}
 */
export function readLasHeader(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 227) throw new LasFormatError('file shorter than a LAS header');
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'LASF') throw new LasFormatError('no LASF signature');
  const major = bytes[24];
  const minor = bytes[25];
  if (major !== 1 || minor > 4) throw new LasFormatError(`unsupported LAS version ${major}.${minor}`);
  const headerSize = dv.getUint16(94, true);
  const offsetToPoints = dv.getUint32(96, true);
  const formatByte = bytes[104];
  // LASzip marks compressed files by setting bit 7 (and bit 6) of the format byte.
  if (formatByte & 0xc0) throw new LasFormatError('compressed point data (LAZ / COPC) is not supported by the LAS-whole adapter');
  const pointFormat = formatByte;
  if (pointFormat > 10) throw new LasFormatError(`unknown point data record format ${pointFormat}`);
  const recordLength = dv.getUint16(105, true);
  if (recordLength < MIN_RECORD_LENGTH[pointFormat]) {
    throw new LasFormatError(`record length ${recordLength} below ${MIN_RECORD_LENGTH[pointFormat]} of format ${pointFormat}`);
  }
  let pointCount = dv.getUint32(107, true);
  if (minor >= 4) {
    if (headerSize < 375 || bytes.byteLength < 375) throw new LasFormatError('LAS 1.4 header shorter than 375 bytes');
    const extended = dv.getBigUint64(247, true);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new LasFormatError('point count too large');
    if (pointCount === 0 || Number(extended) !== 0) pointCount = Number(extended);
  }
  const f64 = (/** @type {number} */ at) => dv.getFloat64(at, true);
  const header = {
    version: `${major}.${minor}`,
    pointFormat,
    recordLength,
    pointCount,
    offsetToPoints,
    scale: /** @type {[number, number, number]} */ ([f64(131), f64(139), f64(147)]),
    offset: /** @type {[number, number, number]} */ ([f64(155), f64(163), f64(171)]),
    max: /** @type {[number, number, number]} */ ([f64(179), f64(195), f64(211)]),
    min: /** @type {[number, number, number]} */ ([f64(187), f64(203), f64(219)]),
  };
  if (header.scale.some((s) => !(s > 0))) throw new LasFormatError('scale factor must be > 0');
  if (offsetToPoints < headerSize || offsetToPoints + pointCount * recordLength > bytes.byteLength) {
    throw new LasFormatError('point data outside the file (truncated or bad offset)');
  }
  return header;
}

/**
 * All points as world coordinates: integer * scale + offset (LAS 1.4 R15 §2.6), x y z interleaved.
 * @param {Uint8Array} bytes @param {LasHeader} h
 * @returns {Float64Array}
 */
export function readLasXyz(bytes, h) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float64Array(3 * h.pointCount);
  for (let i = 0, at = h.offsetToPoints; i < h.pointCount; i++, at += h.recordLength) {
    out[3 * i] = dv.getInt32(at, true) * h.scale[0] + h.offset[0];
    out[3 * i + 1] = dv.getInt32(at + 4, true) * h.scale[1] + h.offset[1];
    out[3 * i + 2] = dv.getInt32(at + 8, true) * h.scale[2] + h.offset[2];
  }
  return out;
}
