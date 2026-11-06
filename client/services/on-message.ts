import { prettifyError, type z, type ZodType } from 'zod';
import { electronAPI } from './electron-api';

/** Listens to a channel of the main process; a message that does not match the schema is dropped and the fields that are wrong are logged */
export const onMessage = <S extends ZodType>(channel: string, schema: S, listener: (payload: z.output<S>) => void) =>
  electronAPI.on<unknown>(channel, (payload) => {
    const result = schema.safeParse(payload);
    if (result.success) listener(result.data);
    else console.error(`The message ${channel} does not match:\n${prettifyError(result.error)}`);
  });
