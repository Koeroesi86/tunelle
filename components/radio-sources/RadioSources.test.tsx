import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RadioSources from './RadioSources';

describe('RadioSources', () => {
  it('says that the stations are not ours and that the title of a song is sent to MusicBrainz', () => {
    render(<RadioSources />);

    expect(screen.getByText('Radio and covers')).toBeTruthy();
    expect(screen.getByText(/Tunelle does not run, check or endorse them/)).toBeTruthy();
    expect(screen.getByText(/title of the song is sent to MusicBrainz/)).toBeTruthy();
    expect(screen.getByText(/not affiliated with radio-browser.info, Deezer or MusicBrainz/)).toBeTruthy();
  });
});
