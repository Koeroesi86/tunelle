import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { memoryFs } from '../test-memory-fs';
import { probeFormat } from './probe-audio';
import { downloadedFormat } from './source-format';

vi.mock('fs/promises', () => memoryFs.promises);
vi.mock('./probe-audio', () => ({ probeFormat: vi.fn() }));

const file = (name: string, content = 'audio') => {
  const target = path.join('/temp', name);
  memoryFs.sync.writeFileSync(target, content);
  return target;
};

describe('downloadedFormat', () => {
  beforeEach(() => {
    memoryFs.sync.mkdirSync('/temp');
    vi.mocked(probeFormat).mockReset().mockResolvedValue({ codec: 'ALAC', bitDepth: 24, float: false });
  });

  it('gives the codec and depth of the file, probed once for all its ranges', async () => {
    const target = file('a.src');

    expect(await downloadedFormat(target)).toEqual({ codec: 'ALAC', bitDepth: 24 });
    expect(await downloadedFormat(target)).toEqual({ codec: 'ALAC', bitDepth: 24 });
    expect(probeFormat).toHaveBeenCalledTimes(1);
  });

  it('probes again when the file is another one', async () => {
    await downloadedFormat(file('b.src'));
    await downloadedFormat(file('b.src', 'another, longer'));

    expect(probeFormat).toHaveBeenCalledTimes(2);
  });

  it('has no codec for a file that ffprobe can not read, and asks again later', async () => {
    const target = file('c.src');
    vi.mocked(probeFormat).mockResolvedValueOnce(undefined);

    expect(await downloadedFormat(target)).toEqual({ codec: null, bitDepth: null });
    expect(await downloadedFormat(target)).toEqual({ codec: 'ALAC', bitDepth: 24 });
  });

  it('has no codec for a file that is gone', async () => {
    expect(await downloadedFormat(path.join('/temp', 'gone.src'))).toEqual({ codec: null, bitDepth: null });
    expect(probeFormat).not.toHaveBeenCalled();
  });
});
