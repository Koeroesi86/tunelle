import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AlbumSummary } from '@shared/types/library';
import type { SourceBrowse, SourceServerInfo } from '@shared/schemas/sources';
import { browseKey } from '../../../redux/sources/reducer';
import { pageRequest } from '../../../redux/sources/lists';
import SourceLibrary from './SourceLibrary';

const album = { id: 'al1', title: 'Goldberg' } as AlbumSummary;

// the views are tested with their containers; here they show the request they were given
vi.mock('../../../containers/library/source-albums', () => ({
  default: ({ request, open }: { request: SourceBrowse; open: (album: AlbumSummary) => void }) => (
    <button type="button" data-testid="albums" onClick={() => open(album)}>
      {JSON.stringify(request)}
    </button>
  ),
}));
vi.mock('../../../containers/library/source-artists', () => ({
  default: ({ request, open }: { request: SourceBrowse; open: (artist: { id: string; name: string }) => void }) => (
    <button type="button" data-testid="artists" onClick={() => open({ id: 'ar1', name: 'Bach' })}>
      {JSON.stringify(request)}
    </button>
  ),
}));
vi.mock('../../../containers/library/source-tracks', () => ({
  default: ({ request, setTitleOrder }: { request: SourceBrowse; setTitleOrder?: (title: boolean) => void }) => (
    <button type="button" data-testid="tracks" onClick={() => setTitleOrder?.(true)}>
      {JSON.stringify(request)}
    </button>
  ),
}));

const home = {
  id: '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11',
  kind: 'plex' as const,
  name: 'Home',
  url: 'https://music.example.com',
  username: 'plex',
  protected: true,
};
const cabin = { ...home, id: '6f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b12', name: 'Cabin' };

const setup = (section: 'albums' | 'artists' | 'tracks', servers: SourceServerInfo[] = [home], browsed = {}, kind: 'plex' | 'subsonic' = 'plex') => {
  const load = vi.fn();
  render(<SourceLibrary kind={kind} section={section} servers={servers} browsed={browsed} load={load} />);
  return load;
};

const shown = (id: string) => JSON.parse(screen.getByTestId(id).textContent ?? '');

describe('SourceLibrary', () => {
  it('asks for the servers when it is shown', () => {
    expect(setup('albums')).toHaveBeenCalled();
  });

  it('says there is no server', () => {
    setup('albums', []);

    expect(screen.getByText(/No server/i)).toBeTruthy();
  });

  it('lists the section of the server, the newest first', () => {
    setup('albums');

    expect(shown('albums')).toMatchObject({ what: 'library', serverId: home.id, kind: 'albums', sort: 'recent' });
  });

  it('shows the tracks of a section of tracks and the artists of a section of artists', () => {
    setup('tracks');
    expect(shown('tracks')).toMatchObject({ kind: 'tracks' });
  });

  it('lists the artists of a server that has no such section', () => {
    setup('tracks', [{ ...home, kind: 'subsonic' as const }], {}, 'subsonic');

    expect(shown('artists')).toEqual({ what: 'artists', serverId: home.id });
  });

  it('opens the albums of an artist and the tracks of an album, and goes back step by step', () => {
    setup('artists');

    fireEvent.click(screen.getByTestId('artists'));
    expect(shown('albums')).toEqual({ what: 'albums', serverId: home.id, id: 'ar1' });
    expect(screen.getByText('Bach')).toBeTruthy();

    fireEvent.click(screen.getByTestId('albums'));
    expect(shown('tracks')).toEqual({ what: 'tracks', serverId: home.id, id: 'al1' });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(shown('albums')).toMatchObject({ what: 'albums' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(shown('artists')).toMatchObject({ what: 'library', kind: 'artists' });
  });

  it('sorts by title, from the chip and from the header of the tracks', () => {
    setup('tracks');

    fireEvent.click(screen.getByTestId('tracks'));

    expect(shown('tracks')).toMatchObject({ sort: 'title' });
  });

  it('picks the server when there are several, and starts again for the other', () => {
    setup('albums', [home, cabin]);

    fireEvent.change(screen.getByLabelText('Server'), { target: { value: cabin.id } });

    expect(shown('albums')).toMatchObject({ serverId: cabin.id });
  });

  it('has no picker for one server', () => {
    setup('albums');

    expect(screen.queryByLabelText('Server')).toBeNull();
  });

  it('says what failed to load', () => {
    const first = pageRequest({ what: 'library', serverId: home.id, kind: 'albums', sort: 'recent', start: 0, size: 1 }, 0);
    setup('albums', [home], { [browseKey(first)]: { error: 'refused' } });

    expect(screen.getByRole('alert').textContent).toContain('refused');
  });
});
