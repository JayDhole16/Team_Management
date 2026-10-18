/** Expected failures. The error handler turns them into `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** The ONE message for every access-code failure: wrong, expired, revoked, used, wrong purpose. */
export const INVALID_CODE_MESSAGE =
  'This code is invalid or has expired. Ask the owner for a new one.';

export const invalidCode = () => new AppError(400, 'INVALID_CODE', INVALID_CODE_MESSAGE);
export const rateLimited = () =>
  new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait 15 minutes and try again.');
export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Please log in.');
export const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.');
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message: string, code = 'BAD_REQUEST') =>
  new AppError(400, code, message);
