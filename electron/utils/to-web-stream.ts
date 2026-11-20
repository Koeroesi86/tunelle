import type { IncomingMessage } from 'node:http';

/** A stream of the answer that reads on demand: a player that stops reading holds the socket, and a cancel closes it */
export const toWebStream = (response: IncomingMessage) => {
  const chunks = response[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      const next = await chunks.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: () => {
      response.destroy();
    },
  });
};
