// export (3D-11): refusal of an export request. `code` is a contract error code (error.schema.json).

export class ExportError extends Error {
  /** @param {'INVALID_PAYLOAD' | 'NOT_FOUND'} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}
