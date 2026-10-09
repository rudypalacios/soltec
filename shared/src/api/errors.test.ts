import { describe, expect, it } from 'vitest';
import { ApiError, toApiError, unwrap, unwrapEmpty } from './errors';

const response = (status: number) => new Response(null, { status });

describe('toApiError', () => {
  it('reads the stable code and the field errors of a validation problem', () => {
    const error = toApiError(response(422), {
      code: 'validation_failed',
      errors: [
        { field: 'email', code: 'taken' },
        { field: 'device.platform', code: 'invalid' },
        { nonsense: true },
      ],
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_failed');
    expect(error.fieldErrors).toEqual({ email: 'taken', 'device.platform': 'invalid' });
  });

  it('turns a body that is not a problem (a proxy error page) into "unexpected"', () => {
    expect(toApiError(response(502), '<html>Bad gateway</html>').code).toBe('unexpected');
    expect(toApiError(response(500), undefined).code).toBe('unexpected');
    expect(toApiError(response(500), { code: 7 }).code).toBe('unexpected');
  });
});

describe('unwrap', () => {
  it('returns the data of a successful call', () => {
    expect(unwrap({ data: { id: 1 }, response: response(200) })).toEqual({ id: 1 });
  });

  it('throws the ApiError of a failed call', () => {
    expect(() =>
      unwrap({ error: { code: 'forbidden' }, response: response(403) }),
    ).toThrowError(ApiError);
  });

  it('refuses a successful call that carries no body', () => {
    expect(() => unwrap({ response: response(200) })).toThrowError('without a body');
  });
});

describe('unwrapEmpty', () => {
  it('accepts a 204 and rejects an error', () => {
    expect(() => unwrapEmpty({ response: response(204) })).not.toThrow();
    expect(() => unwrapEmpty({ error: { code: 'x' }, response: response(401) })).toThrowError(
      ApiError,
    );
  });
});
