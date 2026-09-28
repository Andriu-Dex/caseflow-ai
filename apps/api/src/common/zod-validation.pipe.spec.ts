import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { uuidParamPipe } from './uuid-param.pipe';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ name: z.string().min(1, 'Nombre requerido') }));

  it('returns the parsed value when valid', () => {
    expect(pipe.transform({ name: 'ok' })).toEqual({ name: 'ok' });
  });

  it('throws a 400 with Spanish, field-level errors and no internals', () => {
    try {
      pipe.transform({ name: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        message: 'La solicitud no es válida.',
        errors: [{ path: 'name', message: 'Nombre requerido' }],
      });
    }
  });
});

describe('uuidParamPipe', () => {
  it('accepts a UUID and rejects anything else', () => {
    const id = '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11';

    expect(uuidParamPipe.transform(id)).toBe(id);
    expect(() => uuidParamPipe.transform("1'; DROP TABLE projects;--")).toThrow(
      BadRequestException,
    );
  });
});
