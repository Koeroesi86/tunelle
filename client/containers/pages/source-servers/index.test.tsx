import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/pages/source-servers/SourceServers';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/source-servers/SourceServers', () => ({ default: vi.fn(() => null) }));

describe('the container of SourceServers', () => {
  it('shows what is known of the servers', () => {
    const { store } = renderContainer(<Container kind="plex" openSection={vi.fn()} />);

    expect(propsOf(View).state).toBe(store.getState().sources);
  });

  it('sends what is asked for about the servers', () => {
    const { sent } = renderContainer(<Container kind="plex" openSection={vi.fn()} />);
    const { load, save, remove, discover, signInPlex, cancelPlexSignIn, addPlexServer, readCertificate, clearCertificate } = propsOf(View);

    load();
    save({ kind: 'plex' });
    remove('server');
    discover();
    signInPlex();
    cancelPlexSignIn();
    addPlexServer('machine');
    readCertificate('https://music.local');
    clearCertificate();

    expect(sent()).toEqual([
      { type: 'LOAD_SOURCE_SERVERS' },
      { type: 'SAVE_SOURCE_SERVER', payload: { server: { kind: 'plex' } } },
      { type: 'REMOVE_SOURCE_SERVER', payload: { id: 'server' } },
      { type: 'DISCOVER_SOURCE_SERVERS' },
      { type: 'SIGN_IN_PLEX' },
      { type: 'CANCEL_PLEX_SIGN_IN' },
      { type: 'ADD_PLEX_SERVER', payload: { id: 'machine' } },
      { type: 'READ_SOURCE_CERTIFICATE', payload: { url: 'https://music.local' } },
      { type: 'CLEAR_SOURCE_CERTIFICATE' },
    ]);
  });
});
