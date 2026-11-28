import { describe, expect, it, vi } from 'vitest';
import { aTrack } from '../../../test/a-track';
import { toRemoteTrack } from '../../../domain/remote-track';
import { localUrl } from '../../../services/local-url';
import View from '../../../components/pages/remote-listener/RemoteListener';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/remote-listener/RemoteListener', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../domain/remote-track', () => ({ toRemoteTrack: vi.fn() }));
vi.mock('../../../services/local-url', () => ({ localUrl: vi.fn() }));

describe('the container of RemoteListener', () => {
  it('shows what is known of listening and of the players nearby', () => {
    const { store } = renderContainer(<Container />);
    const { remoteListener, remoteNearby, remoteHost } = store.getState().uiState;

    expect(propsOf(View)).toMatchObject({ state: remoteListener, nearby: remoteNearby, host: remoteHost, resolveUrl: localUrl });
  });

  it('plays what the host plays as the only track of the queue', () => {
    const track = aTrack();
    const snapshot = { state: 'playing' as const, title: 'Prelude', artist: 'Bach', album: 'Suites', position: 1, at: 0, duration: 2 };
    vi.mocked(toRemoteTrack).mockReturnValue(track);
    const { sent } = renderContainer(<Container />);

    propsOf(View).listenAlong(snapshot);

    expect(toRemoteTrack).toHaveBeenCalledWith(snapshot);
    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks: [track] } },
      { type: 'PLAY_TRACK', payload: { track } },
    ]);
  });

  it('connects, browses, controls the host and leaves it', () => {
    const { sent } = renderContainer(<Container />);
    const { connect, confirm, browse, control, leave } = propsOf(View);

    connect('desk.local', 4000);
    confirm('1234');
    browse(true);
    control({ control: 'skip', direction: 'next' });
    leave();

    expect(sent()).toEqual([
      { type: 'CONNECT_REMOTE_HOST', payload: { host: 'desk.local', port: 4000 } },
      { type: 'CONFIRM_REMOTE_HOST', payload: { note: '1234' } },
      { type: 'BROWSE_REMOTE_NEARBY', payload: { active: true } },
      { type: 'SEND_REMOTE_CONTROL', payload: { control: 'skip', direction: 'next' } },
      { type: 'LEAVE_REMOTE_HOST' },
    ]);
  });
});
