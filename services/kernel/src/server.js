// The container's own server around `createKernelHandler` (3D-110; D-33; 3D-ADR-0002 A.4: HTTPS + JSON). Node's
// built-in `https` - no web framework, no new dependency. The handler gets the request stream as its body, so the
// 1 MiB limit is counted while reading (D-317).
import { createServer } from 'node:https';

/**
 * @param {(request: import('./handler.js').KernelRequest) => Promise<import('./handler.js').KernelReply>} handler
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function nodeListener(handler) {
  return (req, res) => {
    handler({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: req })
      .then((reply) => {
        res.writeHead(reply.status, { ...reply.headers, 'content-length': Buffer.byteLength(reply.body) });
        res.end(reply.body);
      })
      .catch(() => {  // the handler maps every failure itself; this is the last guard of the socket
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end('{"code":"INTERNAL","httpStatus":500,"messageKey":"model3d.error.internal"}');
      });
    // a refusal before the whole body was read (401, 403, 413) must not leave the client writing into a closed stream
    res.on('finish', () => { if (!req.readableEnded) req.resume(); });
  };
}

/**
 * HTTPS server of the kernel service. TLS material comes from the deployment (ADR-OPS), never from this repository.
 * @param {{ handler: Parameters<typeof nodeListener>[0], tls: { key: string | Buffer, cert: string | Buffer } }} options
 * @returns {import('node:https').Server}
 */
export function createKernelServer({ handler, tls }) {
  if (!tls?.key || !tls?.cert) throw new TypeError('server: tls.key and tls.cert are required (HTTPS, 3D-ADR-0002 A.4)');
  return createServer({ key: tls.key, cert: tls.cert }, nodeListener(handler));
}
