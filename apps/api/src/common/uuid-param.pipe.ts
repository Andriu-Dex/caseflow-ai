import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

export const uuidParamPipe = new ZodValidationPipe(
  z.uuid({ error: 'El identificador no es válido.' }),
);
