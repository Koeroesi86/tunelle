import { describe, expect, it, vi } from 'vitest';
import { measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';
import { measureSliced } from './measure-sliced';
import { slicerOf } from './slicing/slice-file';
import type { Slice } from './slicing/types';
import { summarise } from './summarise';

vi.mock('./slicing/slice-file', () => ({ slicerOf: vi.fn() }));

const seconds = 20;
/** A tone that is louder in the second half */
const tone = Float32Array.from(
  { length: seconds * measurementRate },
  (_, index) => (index < (seconds * measurementRate) / 2 ? 0.1 : 0.4) * Math.sin((2 * Math.PI * 440 * index) / measurementRate)
);
const decoded = { numberOfChannels: 1, getChannelData: () => tone };

const measureWith = async (slice: Slice) => {
  vi.mocked(slicerOf).mockResolvedValue(async function* () {
    yield slice;
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(1), { status: 206, headers: { 'Content-Range': 'bytes 0-0/1000000' } })));
  return measureSliced(1, 'tunelle://app/track?path=a', 7200, async () => decoded);
};

const integrated = (result: Awaited<ReturnType<typeof measureSliced>>) => (result.outcome === 'measured' ? result.analysis.integratedLufs : undefined);
const loudnessOf = (samples: Float32Array) => summarise([measureBlocks([samples])])?.analysis.integratedLufs;

describe('measureSliced with a piece that tells how much of its end to keep', () => {
  it('measures the end of the decoded piece, whatever the decoder gave in front of it', async () => {
    const result = await measureWith({ bytes: new Uint8Array(1), skip: 0, keep: seconds / 2 });

    expect(integrated(result)).toBeCloseTo(loudnessOf(tone.subarray(tone.length / 2)) ?? 0, 6);
  });

  it('measures all of a piece that is shorter than what it keeps', async () => {
    const result = await measureWith({ bytes: new Uint8Array(1), skip: 0, keep: seconds * 3 });

    expect(integrated(result)).toBeCloseTo(loudnessOf(tone) ?? 0, 6);
  });

  it('leaves out the start of a piece by its seconds when it does not tell what to keep', async () => {
    const result = await measureWith({ bytes: new Uint8Array(1), skip: seconds / 2 });

    expect(integrated(result)).toBeCloseTo(loudnessOf(tone.subarray(tone.length / 2)) ?? 0, 6);
  });
});
