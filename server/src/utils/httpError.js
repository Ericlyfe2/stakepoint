export class HttpError extends Error {
  constructor(status, message, extras = {}) {
    super(message);
    this.status = status;
    this.extras = extras;
  }
}

export const badRequest   = (msg, extras) => new HttpError(400, msg, extras);
export const unauthorized = (msg = 'Unauthorized', extras) => new HttpError(401, msg, extras);
export const forbidden    = (msg = 'Forbidden', extras) => new HttpError(403, msg, extras);
export const notFound     = (msg = 'Not found', extras) => new HttpError(404, msg, extras);
export const conflict     = (msg, extras) => new HttpError(409, msg, extras);
export const tooMany      = (msg, extras) => new HttpError(429, msg, extras);
export const serviceUnavailable = (msg = 'Service unavailable', extras) => new HttpError(503, msg, extras);
