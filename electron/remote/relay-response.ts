import type { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Writes a fetch Response to a node response: status, headers and the body as a stream. A stream that fails ends this response only. */
export const relayResponse = async (answer: Response, response: ServerResponse) => {
  response.writeHead(answer.status, Object.fromEntries(answer.headers));
  if (!answer.body) return response.end();
  await pipeline(Readable.from(answer.body), response).catch(() => response.destroy());
};
