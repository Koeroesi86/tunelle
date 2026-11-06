import { prettifyError, type ZodType } from 'zod';
import { logError } from './log-error';

/** The payload as the schema reads it, undefined (and the fields that are wrong in the log) for one that does not match */
export const parsePayload = <S extends ZodType>(schema: S, payload: unknown) => {
  const result = schema.safeParse(payload);
  if (!result.success) logError(new Error(`Message refused:\n${prettifyError(result.error)}`));

  return result.success ? result.data : undefined;
};
