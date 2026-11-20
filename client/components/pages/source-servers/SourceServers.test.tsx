import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SourcesState } from '../../../redux/sources/reducer';
import SourceServers from './SourceServers';

const id = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const server = { id, kind: 'subsonic' as const, name: 'Home', url: 'https://music.example.com', username: 'me', protected: true };

const setup = (state: Partial<SourcesState> = {}, kind: 'subsonic' | 'jellyfin' = 'subsonic') => {
  const props = {
    kind,
    state: { servers: [], saving: false, browsed: {}, ...state },
    load: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    readCertificate: vi.fn(),
    clearCertificate: vi.fn(),
    browse: vi.fn(),
    play: vi.fn(),
  };
  render(<SourceServers {...props} />);
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

  it('browses the artists of a server and plays a track of an album', () => {
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
    const artists = JSON.stringify({ what: 'artists', serverId: id });
    const props = setup({
      servers: [server],
      browsed: { [artists]: { result: [{ id: 'ar1', name: 'Artist', albumCount: 1 }] }, [request]: { result: [track] } },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Browse Home' }));
    expect(props.browse).toHaveBeenCalledWith({ what: 'artists', serverId: id });
    expect(screen.getByText('Artist')).toBeTruthy();
  });
});

describe('SourceServers for Jellyfin', () => {
  it('lists only the servers of its kind', () => {
    setup({ servers: [server, { ...server, id: '6f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b12', kind: 'jellyfin', name: 'Film room' }] }, 'jellyfin');

    expect(screen.getByText('Film room')).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
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
});
