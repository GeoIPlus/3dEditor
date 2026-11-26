// Request body of the kernel service (3D-109, D-317): at most 1 MiB, counted in bytes while reading and refused with
// `413 PAYLOAD_TOO_LARGE` before any JSON parsing; a body that is not JSON is `400 INVALID_PAYLOAD`.
import { errorReply } from './errors.js';

export const BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * @param {AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string> | Uint8Array | string} source a request
 *   stream (Node `IncomingMessage`), chunks or the whole body
 * @param {{ limit?: number, declaredLength?: number, parse?: (text: string) => any }} [options] `declaredLength`:
 *   `Content-Length`, refused early when above the limit; `parse` defaults to `JSON.parse`
 * @returns {Promise<{ ok: true, value: any } | { ok: false, reply: { httpStatus: number, body: any } }>}
 */
export async function readJsonBody(source, options = {}) {
  const limit = options.limit ?? BODY_LIMIT_BYTES;
  const parse = options.parse ?? JSON.parse;
  const tooLarge = () => ({ ok: /** @type {const} */ (false), reply: errorReply('PAYLOAD_TOO_LARGE', [], `request body above ${limit} bytes`) });
  if (options.declaredLength !== undefined && options.declaredLength > limit) return tooLarge();
  const chunks = typeof source === 'string' || source instanceof Uint8Array ? [source] : source;
  /** @type {Buffer[]} */
  const parts = [];
  let size = 0;
  for await (const c of /** @type {AsyncIterable<Uint8Array | string>} */ (chunks)) {
    const b = typeof c === 'string' ? Buffer.from(c, 'utf8') : Buffer.from(c.buffer, c.byteOffset, c.byteLength);
    size += b.byteLength;
    if (size > limit) return tooLarge();
    parts.push(b);
  }
  try {
    return { ok: true, value: parse(Buffer.concat(parts).toString('utf8')) };
  } catch {
    return { ok: false, reply: errorReply('INVALID_PAYLOAD', [], 'request body is not JSON') };
  }
}
