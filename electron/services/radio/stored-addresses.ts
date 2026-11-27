import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const addressesSchema = z.record(z.string(), z.unknown());
const addressSchema = z.url({ protocol: /^https?$/ });

/** An address per station in a JSON file, the ones stored last are kept past the limit; a file that can not be read or written is left out */
export const createStoredAddresses = (path: string | undefined, limit: number) => {
  let writing: Promise<unknown> = Promise.resolve();

  const read = async () => {
    const stored: unknown = await readFile(path ?? '', 'utf8')
      .then(JSON.parse)
      .catch(() => ({}));

    return new Map(
      Object.entries(addressesSchema.safeParse(stored).data ?? {}).flatMap(([uuid, value]): [string, string][] => {
        const address = addressSchema.safeParse(value).data;

        return address ? [[uuid, address]] : [];
      })
    );
  };

  const write = async (addresses: [string, string][]) => {
    if (!path || addresses.length === 0) return;
    const stored = await read();
    // taken out first, so that an address that is stored again counts as the last one
    addresses.forEach(([uuid]) => stored.delete(uuid));
    const kept = [...stored, ...addresses].slice(-limit);
    await writeFile(path, JSON.stringify(Object.fromEntries(kept))).catch(() => undefined);
  };

  /** One write after the other, as each starts from the file the one before it wrote */
  const store = (addresses: [string, string][]) => {
    writing = writing.then(() => write(addresses));

    return writing;
  };

  return { read, store };
};
