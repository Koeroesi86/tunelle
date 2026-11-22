import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import { toRadioTrack } from '../../../domain/radio-track';
import { useMediaSession } from '../../../hooks/use-media-session';
import { useMpris } from '../../../hooks/use-mpris';
import { useRemoteHost } from '../../../hooks/use-remote-host';
import PlayerIntegrations from './PlayerIntegrations';

vi.mock('../../../hooks/use-media-session', () => ({ useMediaSession: vi.fn(), useMediaSessionActions: vi.fn() }));
vi.mock('../../../hooks/use-mpris', () => ({ useMpris: vi.fn(), useMprisCommands: vi.fn() }));
vi.mock('../../../hooks/use-remote-host', () => ({ useRemoteHost: vi.fn() }));

const song = (path: string): Track => ({ ...toRadioTrack({ uuid: 'u6', name: 'A', country: '', tags: [], codec: 'FLAC', bitrate: 0 }), path, duration: 100 });

const renderIntegrations = (currentSong: Track | null) =>
  render(
    <PlayerIntegrations
      currentSong={currentSong}
      upNext={null}
      streamTitle={null}
      streamArt={null}
      isPlaying={false}
      currentTime={0}
      volume={0.5}
      play={vi.fn()}
      pause={vi.fn()}
      setCurrentTime={vi.fn()}
      setVolume={vi.fn()}
      previousSong={vi.fn()}
      nextSong={vi.fn()}
    />
  );

describe('PlayerIntegrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing, and tells the integrations that nothing plays', () => {
    const { container } = renderIntegrations(null);

    expect(container.innerHTML).toBe('');
    expect(vi.mocked(useMediaSession).mock.calls[0]?.[0]).toBeUndefined();
    expect(vi.mocked(useMpris).mock.calls[0]?.[0]).toBeUndefined();
    expect(vi.mocked(useRemoteHost).mock.calls[0]?.[0]).toBeUndefined();
  });

  it.each([
    ['a file of the library', '/music/a.flac', '/music/a.flac'],
    ['a track of a server of the user', 'subsonic:5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11:s1', undefined],
  ])('gives a listener the path of %s only when it is a file of the library', (_name, path, shared) => {
    renderIntegrations(song(path));

    expect(vi.mocked(useRemoteHost).mock.calls[0]?.[0]?.path).toBe(shared);
  });
});
