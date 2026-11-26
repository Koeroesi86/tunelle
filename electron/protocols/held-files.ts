/** The files of the caches that a request or a window uses, with the number of users of each. See docs/app/decoder-proxy.md */
const held = new Map<string, number>();

export const isHeld = (path: string) => held.has(path);

/** Keeps a file from the eviction until the returned function is called; calls after the first do nothing */
export const holdFile = (path: string) => {
  let holding = true;
  held.set(path, (held.get(path) ?? 0) + 1);
  return () => {
    if (!holding) return;
    holding = false;
    const others = (held.get(path) ?? 1) - 1;
    if (others > 0) held.set(path, others);
    else held.delete(path);
  };
};

/** Holds a file while its answer is made, and until the body of the answer has ended, failed or been cancelled */
export const answerHolding = async (path: string, answer: () => Promise<Response>) => {
  const release = holdFile(path);
  const response = await answer().catch((error: unknown) => {
    release();
    throw error;
  });
  if (!response.body) {
    release();
    return response;
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  void response.body
    .pipeTo(writable)
    .catch(() => undefined)
    .finally(release);
  return new Response(readable, response);
};
