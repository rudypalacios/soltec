import { ApiError } from '@soltec/shared';
import { describe, expect, it } from 'vitest';
import { fieldMessages, problemMessage } from './messages';

describe('problemMessage', () => {
  it('speaks Spanish for the codes of the API', () => {
    expect(problemMessage(new ApiError(401, 'invalid_credentials', {}))).toBe(
      'Correo o contraseña incorrectos.',
    );
    expect(problemMessage(new ApiError(409, 'last_admin', {}))).toContain('administrador');
  });

  it('lets a screen say something more precise for a code', () => {
    const error = new ApiError(409, 'conflict', {});

    expect(problemMessage(error, { conflict: 'Hay usuarios con este perfil.' })).toBe(
      'Hay usuarios con este perfil.',
    );
    expect(problemMessage(error)).toContain('Otra persona');
  });

  it('has a message for a code it does not know', () => {
    expect(problemMessage(new ApiError(500, 'brand_new_code', {}))).toContain('error inesperado');
  });

  it('says the service cannot be reached when the network fails', () => {
    expect(problemMessage(new TypeError('Failed to fetch'))).toContain('No se pudo contactar');
  });
});

describe('fieldMessages', () => {
  it('translates each field error and prefers the overrides of that field', () => {
    const error = new ApiError(422, 'validation_failed', { email: 'taken', password: 'too_short' });

    expect(fieldMessages(error, { password: { too_short: 'Mínimo 12.' } })).toEqual({
      email: 'Ya está en uso.',
      password: 'Mínimo 12.',
    });
  });

  it('returns nothing for an error that is not a validation failure', () => {
    expect(fieldMessages(new TypeError('x'))).toEqual({});
    expect(fieldMessages(new ApiError(403, 'forbidden', {}))).toEqual({});
  });
});
