import { beforeEach, describe, expect, it, vi } from 'vitest';
import { measureBlocks } from './block-energies';
import { measureSliced } from './measure-sliced';
import { measureWebCodecs } from './measure-webcodecs';
import { measureTrack, slicedFromSeconds, wholeFileSeconds } from './measure-track';
import { readBody } from './read-body';
import { summarise } from './summarise';

vi.mock('./measure-sliced', () => ({ measureSliced: vi.fn() }));
vi.mock('./measure-webcodecs', () => ({ measureWebCodecs: vi.fn() }));
vi.mock('./read-body', () => ({ readBody: vi.fn() }));
vi.mock('./block-energies', () => ({ measureBlocks: vi.fn() }));
vi.mock('./summarise', () => ({ summarise: vi.fn() }));

const summary = { analysis: { integratedLufs: -20 }, trackGain: 2, trackPeak: 0.5 };
const audio = { numberOfChannels: 1, getChannelData: () => new Float32Array(1) };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      decodeAudioData = () => Promise.resolve(audio);
    }
  );
  vi.mocked(readBody).mockResolvedValue(new Uint8Array(1));
  vi.mocked(measureBlocks).mockReturnValue({ energies: new Float64Array(1), peak: 0.5, channels: 1 });
  vi.mocked(summarise).mockReturnValue(summary as never);
});

describe('measureTrack', () => {
  it('decodes a file up to the sliced length as a whole', async () => {
    const result = await measureTrack(1, 'a', slicedFromSeconds, vi.fn());
    expect(measureSliced).not.toHaveBeenCalled();
    expect(result.outcome).toBe('measured');
  });

  it('cuts a longer file that has a slicer', async () => {
    vi.mocked(measureSliced).mockResolvedValue({ id: 1, outcome: 'measured', ...summary } as never);
    const result = await measureTrack(1, 'a', slicedFromSeconds + 1, vi.fn());
    expect(measureSliced).toHaveBeenCalled();
    expect(result.outcome).toBe('measured');
  });

  it('decodes as a whole a file of a format that is not cut, up to the whole file length', async () => {
    vi.mocked(measureSliced).mockResolvedValue({ id: 1, outcome: 'too-large' });
    const result = await measureTrack(1, 'a', wholeFileSeconds, vi.fn());
    expect(result.outcome).toBe('measured');
  });

  it('measures with the decoder of the page a long file that is not cut when it can', async () => {
    vi.mocked(measureSliced).mockResolvedValue({ id: 1, outcome: 'too-large' });
    vi.mocked(measureWebCodecs).mockResolvedValue({ id: 1, outcome: 'measured', ...summary } as never);
    const result = await measureTrack(1, 'a', wholeFileSeconds + 1, vi.fn());
    expect(result.outcome).toBe('measured');
  });

  it('stores too-large for a file of a format that is not cut above the whole file length', async () => {
    vi.mocked(measureSliced).mockResolvedValue({ id: 1, outcome: 'too-large' });
    const result = await measureTrack(1, 'a', wholeFileSeconds + 1, vi.fn());
    expect(result.outcome).toBe('too-large');
  });
});
