import type { components } from './generated/schema';

type FieldError = components['schemas']['FieldError'];

/**
 * A failed API call in a shape the screens can use: the HTTP status, the stable English `code` of the problem
 * and, for a validation failure, the code of each wrong field. The text the user reads is chosen by the web app.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Field path (for example "device.platform") → field error code (for example "too_short"). */
    readonly fieldErrors: Readonly<Record<string, string>>,
  ) {
    super(`API error ${status} ${code}`);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.field === 'string' && typeof value.code === 'string';
}

/** Builds the error of a non-2xx response; a body that is not a problem (a proxy error page) becomes `unexpected`. */
export function toApiError(response: Response, body: unknown): ApiError {
  const code = isRecord(body) && typeof body.code === 'string' ? body.code : 'unexpected';
  const fieldErrors: Record<string, string> = {};
  if (isRecord(body) && Array.isArray(body.errors)) {
    for (const error of body.errors) {
      if (isFieldError(error)) {
        fieldErrors[error.field] = error.code;
      }
    }
  }
  return new ApiError(response.status, code, fieldErrors);
}

/** Returns the body of a successful call or throws the ApiError of a failed one. */
export function unwrap<Data>(result: {
  data?: Data;
  error?: unknown;
  response: Response;
}): Data {
  if (!result.response.ok) {
    throw toApiError(result.response, result.error);
  }
  if (result.data === undefined) {
    throw new Error('The API answered without a body.');
  }
  return result.data;
}

/** For calls that answer 204: throws the ApiError of a failed one. */
export function unwrapEmpty(result: { error?: unknown; response: Response }): void {
  if (!result.response.ok) {
    throw toApiError(result.response, result.error);
  }
}
