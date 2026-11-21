import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../../redux/reducers';
import SourceLibrary from '.';

const server = { id: '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11', kind: 'plex' as const, name: 'Home', url: 'http://home', username: 'plex', protected: true };

describe('the page of a server library', () => {
  it.each(['albums', 'artists', 'tracks'] as const)('asks once for the first page of the %s, and does not loop on the answer of the store', (section) => {
    const store = createStore(reducers);
    store.dispatch({ type: 'SOURCE_SERVERS_LOADED', payload: { servers: [server] } });
    const dispatch = vi.spyOn(store, 'dispatch');

    render(
      <Provider store={store}>
        <SourceLibrary kind="plex" section={section} />
      </Provider>
    );

    expect(dispatch.mock.calls.filter(([action]) => action.type === 'BROWSE_SOURCE')).toHaveLength(1);
  });
});
