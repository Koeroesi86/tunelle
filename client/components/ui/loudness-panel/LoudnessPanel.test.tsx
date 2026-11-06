import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LoudnessAnalysis } from '@shared/types/loudness';
import { fetchLoudnessAnalysis } from '../../../services/library-api';
import LoudnessPanel from './LoudnessPanel';

vi.mock('../../../services/library-api', () => ({ fetchLoudnessAnalysis: vi.fn() }));

const analysis: LoudnessAnalysis = {
  v: 1,
  sampleRate: 48000,
  channels: 2,
  integratedLufs: -9.24,
  loudnessRange: 12.3,
  // 1.037 of the full scale is +0.3 dBFS
  samplePeak: 1.037,
  shortTerm: [-92],
  histogram: { bin: 0.1, counts: { '-120': 4, '-95': 2 } },
};

describe('LoudnessPanel', () => {
  beforeEach(() => vi.mocked(fetchLoudnessAnalysis).mockReset());

  it('shows the loudness, the range and the peak of the track, and its histogram', async () => {
    vi.mocked(fetchLoudnessAnalysis).mockResolvedValue(analysis);

    render(<LoudnessPanel path="/music/a.flac" />);

    expect(await screen.findByText('-9.2 LUFS')).toBeTruthy();
    expect(screen.getByText('12.3 LU')).toBeTruthy();
    expect(screen.getByText('0.3 dBFS')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('How the loudness of the track is spread, from -12 to -9 LUFS');
    expect(fetchLoudnessAnalysis).toHaveBeenCalledWith('/music/a.flac');
  });

  it('shows nothing for a track that was not measured', async () => {
    vi.mocked(fetchLoudnessAnalysis).mockResolvedValue(undefined);

    const { container } = render(<LoudnessPanel path="/music/a.flac" />);
    await vi.waitFor(() => expect(fetchLoudnessAnalysis).toHaveBeenCalled());

    expect(container.textContent).toBe('');
  });

  it('reads the track again when another one plays, and drops what it had until the answer comes', async () => {
    vi.mocked(fetchLoudnessAnalysis)
      .mockResolvedValueOnce(analysis)
      .mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(<LoudnessPanel path="/music/a.flac" />);
    await screen.findByText('-9.2 LUFS');

    rerender(<LoudnessPanel path="/music/b.flac" />);

    expect(screen.queryByText('-9.2 LUFS')).toBeNull();
    expect(fetchLoudnessAnalysis).toHaveBeenLastCalledWith('/music/b.flac');
  });

  describe('how far the song is played', () => {
    const positionOf = (container: HTMLElement) => container.querySelector<HTMLElement>('b[aria-hidden]')?.style.left;

    it('has a bar that is where the song is across the histogram, and moves on as it plays', async () => {
      vi.mocked(fetchLoudnessAnalysis).mockResolvedValue(analysis);
      const { container, rerender } = render(<LoudnessPanel path="/music/a.flac" duration={310} currentTime={6} />);
      await screen.findByText('-9.2 LUFS');
      expect(Number.parseFloat(positionOf(container) ?? '')).toBeCloseTo((6 / 310) * 100, 5);

      rerender(<LoudnessPanel path="/music/a.flac" duration={310} currentTime={155} />);

      expect(positionOf(container)).toBe('50%');
    });

    it('keeps the bar in the histogram when the position is outside the track', async () => {
      vi.mocked(fetchLoudnessAnalysis).mockResolvedValue(analysis);
      const { container, rerender } = render(<LoudnessPanel path="/music/a.flac" duration={100} currentTime={120} />);
      await screen.findByText('-9.2 LUFS');
      expect(positionOf(container)).toBe('100%');

      rerender(<LoudnessPanel path="/music/a.flac" duration={100} currentTime={-3} />);

      expect(positionOf(container)).toBe('0%');
    });

    it.each([
      ['the length of the track is not known', undefined, 10],
      ['the track has no length', 0, 10],
      ['the position is not known', 100, undefined],
    ])('has no bar when %s', async (_, duration, currentTime) => {
      vi.mocked(fetchLoudnessAnalysis).mockResolvedValue(analysis);

      const { container } = render(<LoudnessPanel path="/music/a.flac" duration={duration} currentTime={currentTime} />);
      await screen.findByText('-9.2 LUFS');

      expect(positionOf(container)).toBeUndefined();
    });
  });
});
