"""Thin HTTP wrapper of the val3dity image (3D-74; contracts/val3dity, D-3D74-3, D-3D74-5).

GET /version  -> 200 validator identity (validator.json written at build time by collect.sh)
POST /validate -> 200 { validator, report } with val3dity's own JSON report, passed through unchanged
Any failure    -> the error schema: 400 BAD_REQUEST, 404 NOT_FOUND, 413 PAYLOAD_TOO_LARGE, 500 VALIDATOR_FAILED,
                  504 VALIDATOR_TIMEOUT.

The wrapper only runs val3dity; every mapping of ids and codes is the service adapter's (D-3D74-3). Python standard
library only. Settings (environment): PORT (8080), VAL3DITY_HOME (/opt/val3dity), VAL3DITY_MAX_BYTES (body limit,
64 MiB), VAL3DITY_TIMEOUT_S (60). The limit and timeout are image settings, not contract values [A].
"""
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOME = os.environ.get("VAL3DITY_HOME", "/opt/val3dity")
BINARY = os.path.join(HOME, "bin", "val3dity")
MAX_BYTES = int(os.environ.get("VAL3DITY_MAX_BYTES", str(64 * 1024 * 1024)))
TIMEOUT_S = float(os.environ.get("VAL3DITY_TIMEOUT_S", "60"))
PARAMETERS = (("snapTolM", "--snap_tol"), ("planarityD2pTolM", "--planarity_d2p_tol"),
              ("planarityNormalsTolDeg", "--planarity_n_tol"))
STATUS = {"BAD_REQUEST": 400, "NOT_FOUND": 404, "PAYLOAD_TOO_LARGE": 413, "VALIDATOR_FAILED": 500,
          "VALIDATOR_TIMEOUT": 504}

with open(os.path.join(HOME, "validator.json"), encoding="utf-8") as f:
    VALIDATOR = json.load(f)


class Failure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def arguments(body):
    """val3dity command-line options of a validate-request; Failure BAD_REQUEST when it is not one."""
    if not isinstance(body, dict) or set(body) != {"document", "parameters"}:
        raise Failure("BAD_REQUEST", "body must hold exactly document and parameters")
    doc, params = body["document"], body["parameters"]
    if not isinstance(doc, dict) or doc.get("type") != "CityJSON" or not isinstance(doc.get("CityObjects"), dict):
        raise Failure("BAD_REQUEST", "document is not a CityJSON object")
    names = [name for name, _ in PARAMETERS]
    if not isinstance(params, dict) or set(params) != set(names) or not all(positive(params[n]) for n in names):
        raise Failure("BAD_REQUEST", "parameters must be " + ", ".join(names) + ", each a positive number")
    if params["planarityNormalsTolDeg"] > 90:
        raise Failure("BAD_REQUEST", "planarityNormalsTolDeg above 90")
    return [arg for name, option in PARAMETERS for arg in (option, repr(float(params[name])))]


def validate(body):
    options = arguments(body)
    with tempfile.TemporaryDirectory() as work:
        source, target = os.path.join(work, "input.city.json"), os.path.join(work, "report.json")
        with open(source, "w", encoding="utf-8") as f:
            json.dump(body["document"], f)
        try:
            run = subprocess.run([BINARY, source, "-r", target, *options], capture_output=True, timeout=TIMEOUT_S)
        except subprocess.TimeoutExpired:
            raise Failure("VALIDATOR_TIMEOUT", f"val3dity ran longer than {TIMEOUT_S} s")
        if run.returncode != 0 or not os.path.exists(target):
            tail = run.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] or ["no output"]
            raise Failure("VALIDATOR_FAILED", f"val3dity exited {run.returncode}: {tail[0]}")
        with open(target, encoding="utf-8") as f:
            report = json.load(f)
    return {"validator": VALIDATOR, "report": report}


class Handler(BaseHTTPRequestHandler):
    server_version = "val3dity-wrapper/1"

    def reply(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def fail(self, failure):
        self.reply(STATUS[failure.code], {"code": failure.code, "httpStatus": STATUS[failure.code],
                                          "message": str(failure)})

    def do_GET(self):
        if self.path == "/version":
            self.reply(200, VALIDATOR)
        else:
            self.fail(Failure("NOT_FOUND", f"no route GET {self.path}"))

    def do_POST(self):
        try:
            if self.path != "/validate":
                raise Failure("NOT_FOUND", f"no route POST {self.path}")
            length = int(self.headers.get("content-length") or "0")
            if length > MAX_BYTES:
                raise Failure("PAYLOAD_TOO_LARGE", f"body above {MAX_BYTES} bytes")
            try:
                body = json.loads(self.rfile.read(length))
            except ValueError:
                raise Failure("BAD_REQUEST", "body is not JSON")
            self.reply(200, validate(body))
        except Failure as failure:
            self.fail(failure)

    def log_message(self, fmt, *args):  # one line per request on stderr
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
