import { z } from 'zod';

// what the page asks of the listener side; a message of the wrong shape is dropped (electron/utils/parse-payload.ts)

export const connectSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1024).max(65535),
});

export const confirmSchema = z.object({ note: z.string().max(200) });
