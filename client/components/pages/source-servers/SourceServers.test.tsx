import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SourcesState } from '../../../redux/sources/reducer';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../../redux/reducers';
import SourceServers from './SourceServers';

const id = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const server = { id, kind: 'subsonic' as const, name: 'Home', url: 'https://music.example.com', username: 'me', protected: true };

const setup = (state: Partial<SourcesState> = {}, kind: 'subsonic' | 'jellyfin' | 'plex' = 'subsonic') => {
  const props = {
    kind,
    state: { servers: [], saving: false, ...state },
    load: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    readCertificate: vi.fn(),
    discover: vi.fn(),
    signInPlex: vi.fn(),
    cancelPlexSignIn: vi.fn(),
    addPlexServer: vi.fn(),
    clearCertificate: vi.fn(),
    openSection: vi.fn(),
  };
  render(
    <Provider store={createStore(reducers)}>
      <SourceServers {...props} />
    </Provider>
  );
  return props;
};

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

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
});

describe('SourceServers with one or more servers', () => {
  it('is the page to add and remove servers, with no library, without a section', () => {
    setup({ servers: [server], browsed: {} });

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a server' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Home' })).toBeTruthy();
  });

  it('links to the sections of its kind, and a kind with no server shows none', () => {
    const { openSection } = setup({ servers: [server] });

    expect(screen.queryByRole('button', { name: 'Songs' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Artists' }));
    expect(openSection).toHaveBeenCalledWith('artists');
    expect(screen.getByRole('button', { name: 'Albums' })).toBeTruthy();
  });

  it('links to the songs of a kind that has them', () => {
    setup({ servers: [{ ...server, kind: 'jellyfin' }] }, 'jellyfin');

    expect(screen.getByRole('button', { name: 'Songs' })).toBeTruthy();
  });

  it('shows no links without a server', () => {
    setup({ servers: [] });

    expect(screen.queryByRole('button', { name: 'Albums' })).toBeNull();
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
