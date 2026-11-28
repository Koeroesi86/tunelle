import path from 'path';
import { fileURLToPath } from 'url';
import { stat } from 'fs/promises';
import { net } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { unusualNames } from '../../shared/test-unusual-names';
import { serveFile } from './serve-file';

vi.mock('fs/promises', () => ({ stat: vi.fn(async () => ({ isFile: () => true, size: 5 })) }));
vi.mock('electron', () => ({ net: { fetch: vi.fn(async () => new Response('audio')) } }));

describe('serveFile', () => {
  it.each(unusualNames)('asks for a file with $kind by an address that leads back to it', async ({ name }) => {
    const file = path.resolve('/music', name, `${name}.m4a`);

    await serveFile(file, new Request('tunelle://app/track'));

    expect(stat).toHaveBeenLastCalledWith(file);
    expect(fileURLToPath(String(vi.mocked(net.fetch).mock.lastCall?.[0]))).toBe(file);
  });
});
