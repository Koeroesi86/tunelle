const collect = async (reader: ReadableStreamDefaultReader<Uint8Array>, chunks: Uint8Array[], onChunk: () => void): Promise<Uint8Array[]> => {
  const { done, value } = await reader.read();
  if (done) return chunks;

  chunks.push(value);
  onChunk();
  return collect(reader, chunks, onChunk);
};

/** The body of an answer, read chunk by chunk so `onChunk` tells that a slow drive is still delivering; undefined when the stream fails */
export const readBody = async (response: Response, onChunk: () => void): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  const reader = response.body?.getReader();
  const chunks = reader ? await collect(reader, [], onChunk).catch(() => undefined) : [];
  if (!chunks) return undefined;

  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  return bytes;
};
