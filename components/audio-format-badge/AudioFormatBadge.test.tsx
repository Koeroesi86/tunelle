import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import AudioFormatBadge from './AudioFormatBadge';

const track: Track = {
  path: '/music/a.flac',
  artist: '',
  album: '',
  title: '',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
};

describe('AudioFormatBadge', () => {
  it('shows the format of the track', () => {
    const { container } = render(<AudioFormatBadge track={{ ...track, codec: 'FLAC', lossless: 1, bitDepth: 24, sampleRate: 96000 }} />);
    expect(container.textContent).toBe('FLAC 24/96');
  });

  it('shows nothing for a track without a format', () => {
    expect(render(<AudioFormatBadge track={track} />).container.textContent).toBe('');
  });
});
