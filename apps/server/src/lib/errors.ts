export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, message);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, message);
}

export function forbidden(message = 'Not allowed'): AppError {
  return new AppError(403, message);
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(404, message);
}

export function conflict(message: string): AppError {
  return new AppError(409, message);
}

export function tooManyRequests(message = 'Too many requests'): AppError {
  return new AppError(429, message);
}
