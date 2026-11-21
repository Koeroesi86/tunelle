import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SourcesState } from '../../../redux/sources/reducer';
import SourceServers from './SourceServers';

const id = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const server = { id, kind: 'subsonic' as const, name: 'Home', url: 'https://music.example.com', username: 'me', protected: true };

const setup = (state: Partial<SourcesState> = {}, kind: 'subsonic' | 'jellyfin' | 'plex' = 'subsonic', section?: 'albums' | 'artists' | 'tracks') => {
  const props = {
    kind,
    section,
    state: { servers: [], saving: false, browsed: {}, ...state },
    load: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    readCertificate: vi.fn(),
    discover: vi.fn(),
    signInPlex: vi.fn(),
    cancelPlexSignIn: vi.fn(),
    addPlexServer: vi.fn(),
    clearCertificate: vi.fn(),
    browse: vi.fn(),
    play: vi.fn(),
  };
  render(<SourceServers {...props} />);
  return props;
};

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const subsonicAlbums = JSON.stringify({ what: 'library', serverId: id, kind: 'albums', sort: 'recent', start: 0, size: 60 });

describe('SourceServers', () => {
  it('asks for the servers when it is shown', () => {
    expect(setup().load).toHaveBeenCalled();
  });

  it('sends a server with the password once it is filled in', () => {
    const { save } = setup();
    type('Name', 'Home');
    type('Address', 'https://music.example.com');
    type('User name', 'me');
    type('Password', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'subsonic', name: 'Home', password: 'secret', certificate: undefined }));
  });

  it('warns about an address without encryption', () => {
    setup();
    type('Address', 'http://music.local');

    expect(screen.getByText(/not encrypted/)).toBeTruthy();
  });

  it('shows the code of a certificate and sends the approved one with the server', () => {
    const { save } = setup({ certificate: { url: 'https://music.example.com', certificate: 'PEM', code: 'AB12' } });
    type('Name', 'Home');
    type('Address', 'https://music.example.com');
    type('User name', 'me');
    type('Password', 'secret');

    expect(screen.getByText('AB12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve and add' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ certificate: 'PEM' }));
  });

  it('words a wrong login and offers to look at the certificate after a failure', () => {
    const { readCertificate } = setup({ failure: { id, error: 'x', code: 40 } });
    type('Address', 'https://music.example.com');

    expect(screen.getByText('The user name or the password is wrong.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'The certificate is not valid: look at it' }));
    expect(readCertificate).toHaveBeenCalledWith('https://music.example.com');
  });

  it('warns about a password in plain text and removes a server', () => {
    const { remove } = setup({ servers: [{ ...server, protected: false }] });

    expect(screen.getByText(/plain text/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Home' }));
    expect(remove).toHaveBeenCalledWith(id);
  });

  it('browses the albums of a server and opens one for its songs', () => {
    const track = {
      path: `subsonic:${id}:s1`,
      title: 'Song',
      artist: 'A',
      album: 'B',
      year: '',
      track: '1',
      disk: '',
      genre: '',
      picture: null,
      duration: 1,
      codec: 'FLAC',
      bitrate: null,
      lossless: 1,
    };
    const request = JSON.stringify({ what: 'tracks', serverId: id, id: 'al1' });
    const props = setup(
      {
        servers: [server],
        browsed: { [subsonicAlbums]: { result: { items: [{ id: 'al1', title: 'Goldberg', artist: 'Artist', year: '' }] } }, [request]: { result: [track] } },
      },
      'subsonic',
      'albums'
    );

    expect(props.browse).toHaveBeenCalledWith({ what: 'library', serverId: id, kind: 'albums', sort: 'recent', start: 0, size: 60 });
    fireEvent.click(screen.getByRole('button', { name: /Goldberg/ }));
    expect(props.browse).toHaveBeenLastCalledWith({ what: 'tracks', serverId: id, id: 'al1' });
  });

  it('leaves without an error when the actions it dispatches answer with an object', () => {
    const dispatched = () => ({ type: 'ANY' });
    const props = {
      kind: 'subsonic' as const,
      state: { servers: [server], saving: false, browsed: {} },
      load: vi.fn(dispatched),
      save: vi.fn(),
      remove: vi.fn(),
      readCertificate: vi.fn(),
      discover: vi.fn(),
      signInPlex: vi.fn(),
      cancelPlexSignIn: vi.fn(),
      addPlexServer: vi.fn(),
      clearCertificate: vi.fn(),
      browse: vi.fn(dispatched),
      play: vi.fn(),
    };
    const { unmount } = render(<SourceServers {...props} />);

    expect(unmount).not.toThrow();
  });

  it('shows no count of albums or songs that the server did not tell', () => {
    const artists = JSON.stringify({ what: 'library', serverId: id, kind: 'artists', sort: 'recent', start: 0, size: 60 });
    setup({ servers: [server], browsed: { [artists]: { result: { total: 1, items: [{ id: 'ar1', name: 'Artist' }] } } } }, 'subsonic', 'artists');

    expect(screen.getByText('Artist')).toBeTruthy();
    expect(screen.queryByText(/album/i, { selector: 'span' })).toBeNull();
  });
});

describe('SourceServers with one or more servers', () => {
  const other = { ...server, id: '6f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b12', name: 'Cabin' };

  it('shows the library of the only server with no name, and just adding another as an option', () => {
    const props = setup({ servers: [server], browsed: {} }, 'subsonic', 'albums');

    expect(props.browse).toHaveBeenCalledWith(expect.objectContaining({ what: 'library', serverId: id }));
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('is the page to add and remove servers, with no library, without a section', () => {
    const props = setup({ servers: [server], browsed: {} });

    expect(props.browse).not.toHaveBeenCalled();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a server' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Home' })).toBeTruthy();
  });

  it('says there is no server in a section of a kind that has none', () => {
    setup({ servers: [] }, 'plex', 'albums');

    expect(screen.getByText(/No server/i)).toBeTruthy();
  });

  it('groups the libraries of several servers under their names', () => {
    const props = setup({ servers: [server, other], browsed: {} }, 'subsonic', 'albums');

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Cabin')).toBeTruthy();
    expect(props.browse).toHaveBeenCalledWith(expect.objectContaining({ what: 'library', serverId: id }));
    expect(props.browse).toHaveBeenCalledWith(expect.objectContaining({ what: 'library', serverId: other.id }));
  });
});

describe('SourceServers for Jellyfin', () => {
  it('lists only the servers of its kind', () => {
    setup({ servers: [server, { ...server, id: '6f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b12', kind: 'jellyfin', name: 'Film room' }] }, 'jellyfin');

    expect(screen.getByRole('button', { name: 'Remove Film room' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Home' })).toBeNull();
  });

  it('suggests a name of its own kind', () => {
    setup({}, 'jellyfin');

    expect(screen.getByLabelText('Name').getAttribute('placeholder')).toBe('Jellyfin');
  });

  it('sends a server of its kind', () => {
    const { save } = setup({}, 'jellyfin');
    type('Name', 'Film room');
    type('Address', 'https://jf.example.com');
    type('User name', 'me');
    type('Password', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jellyfin', name: 'Film room' }));
  });

  it('has no search of the network for Subsonic', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Look on the network' })).toBeNull();
  });

  it('looks on the network and fills the form with the server that is chosen', () => {
    const { discover } = setup({ discovery: { searching: false, servers: [{ id: 'x', name: 'Film room', url: 'http://192.168.1.5:8096' }] } }, 'jellyfin');
    fireEvent.click(screen.getByRole('button', { name: 'Look on the network' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Film room' }));

    expect(discover).toHaveBeenCalled();
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('http://192.168.1.5:8096');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Film room');
  });

  it('does not offer a server that is added already, and says when none answered', () => {
    setup(
      {
        servers: [{ ...server, kind: 'jellyfin', url: 'http://192.168.1.5:8096' }],
        discovery: { searching: false, servers: [{ id: 'x', name: 'Film room', url: 'http://192.168.1.5:8096' }] },
      },
      'jellyfin'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add a server' }));

    expect(screen.queryByRole('button', { name: 'Use Film room' })).toBeNull();
    expect(screen.getByText(/No Jellyfin server answered/)).toBeTruthy();
  });

  it('sends a Plex server with its token and a fixed user, and asks for no user name', () => {
    const { save } = setup({}, 'plex');
    expect(screen.queryByLabelText('User name')).toBeNull();
    type('Name', 'Den');
    type('Address', 'https://plex.example.com:32400');
    type('Token', 'abc');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'plex', name: 'Den', username: 'plex', password: 'abc' }));
  });

  it('lists only the Plex servers on the Plex page', () => {
    setup({ servers: [server, { ...server, id: '6f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b12', kind: 'plex', name: 'Den' }] }, 'plex');

    expect(screen.getByRole('button', { name: 'Remove Den' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Home' })).toBeNull();
  });

  it('signs in with Plex from the Plex page only', () => {
    const { signInPlex } = setup({}, 'plex');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Plex' }));

    expect(signInPlex).toHaveBeenCalled();
  });

  it('does not offer the sign in with Plex on the page of another kind', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Sign in with Plex' })).toBeNull();
  });

  it('shows the wait with a way to cancel it', () => {
    const { cancelPlexSignIn } = setup({ plexAccount: { status: 'waiting' } }, 'plex');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('status').textContent).toContain('approve the sign in');
    expect(cancelPlexSignIn).toHaveBeenCalled();
  });

  it('lists the servers of the account and adds the one that is chosen', () => {
    const { addPlexServer } = setup({ plexAccount: { status: 'servers', servers: [{ id: 'm1', name: 'Den' }] } }, 'plex');
    fireEvent.click(screen.getByRole('button', { name: 'Add Den' }));

    expect(addPlexServer).toHaveBeenCalledWith('m1');
  });

  it('says when the sign in failed', () => {
    setup({ plexAccount: { status: 'failed', error: 'plex.tv answered 500' } }, 'plex');

    expect(screen.getByRole('alert').textContent).toContain('plex.tv answered 500');
  });
});

describe('SourceServers library of a Plex server', () => {
  const plexServer = { ...server, kind: 'plex' as const };
  const page = (kind: string, sort: string, start: number) => JSON.stringify({ what: 'library', serverId: id, kind, sort, start, size: 60 });
  const albums = [{ id: 'a1', title: 'First', artist: 'Band', year: '1999', coverArt: 'a1' }];

  it('starts with the albums, newest first, as covers', () => {
    const props = setup({ servers: [plexServer], browsed: { [page('albums', 'recent', 0)]: { result: { total: 1, items: albums } } } }, 'plex', 'albums');

    expect(props.browse).toHaveBeenCalledWith({ what: 'library', serverId: id, kind: 'albums', sort: 'recent', start: 0, size: 60 });
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Band · 1999')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it.each(['artists', 'tracks'] as const)('asks for the %s of the section and another order from the first page', (section) => {
    const props = setup({ servers: [plexServer] }, 'plex', section);

    expect(props.browse).toHaveBeenLastCalledWith(expect.objectContaining({ kind: section, start: 0 }));
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'title' } });
    expect(props.browse).toHaveBeenLastCalledWith(expect.objectContaining({ kind: section, sort: 'title', start: 0 }));
  });

  it('shows more from the server while there is more', () => {
    const props = setup({ servers: [plexServer], browsed: { [page('albums', 'recent', 0)]: { result: { total: 120, items: albums } } } }, 'plex', 'albums');

    expect(screen.getByText('1 of 120')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(props.browse).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'albums', start: 60 }));
  });

  it('opens an album of the grid for its songs', () => {
    const props = setup({ servers: [plexServer], browsed: { [page('albums', 'recent', 0)]: { result: { total: 1, items: albums } } } }, 'plex', 'albums');

    fireEvent.click(screen.getByRole('button', { name: /First/ }));

    expect(props.browse).toHaveBeenLastCalledWith({ what: 'tracks', serverId: id, id: 'a1' });
  });

  it('lists nothing for a section that the kind does not have: no songs for Subsonic', () => {
    const props = setup({ servers: [server] }, 'subsonic', 'tracks');

    expect(props.browse).toHaveBeenCalledWith(expect.not.objectContaining({ what: 'library' }));
    expect(screen.queryByLabelText('Sort')).toBeNull();
  });

  it('shows more while the last page is full when the server tells no total, and says no count', () => {
    const full = Array.from({ length: 60 }, (_, index) => ({ id: `al${index}`, title: `Album ${index}`, artist: 'A', year: '' }));
    const props = setup({ servers: [server], browsed: { [subsonicAlbums]: { result: { items: full } } } }, 'subsonic', 'albums');

    expect(screen.queryByText(/ of /)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(props.browse).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'albums', start: 60 }));
  });

  it('shows no more when the last page of a server without a total is not full', () => {
    setup(
      { servers: [server], browsed: { [subsonicAlbums]: { result: { items: [{ id: 'al1', title: 'Album', artist: 'A', year: '' }] } } } },
      'subsonic',
      'albums'
    );

    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });
});
