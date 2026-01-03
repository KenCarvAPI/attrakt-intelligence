export class IngestionError extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly eventType: string,
    public readonly retryable: boolean = true,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'IngestionError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class IdentityResolutionError extends Error {
  constructor(
    message: string,
    public readonly clientId: string,
    public readonly platform?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'IdentityResolutionError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ConfigurationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PlatformClientError extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly retryable: boolean = false,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PlatformClientError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof IngestionError) return error.retryable;
  if (error instanceof PlatformClientError) return error.retryable;
  if (error instanceof IdentityResolutionError) return false;
  if (error instanceof ConfigurationError) return false;
  return true; // Default to retryable for unknown errors
}
