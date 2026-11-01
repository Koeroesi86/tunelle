import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import type { UpdateState } from '../../types/update';
import About from './index';

const state: UpdateState = { version: '26.10.5', electron: '40.0.0', chrome: '140.0.0', unavailable: undefined, automatic: true, status: { kind: 'idle' } };

const setup = (actions: AppAction[]) => {
  const store = createStore(reducers);
  actions.forEach((action) => store.dispatch(action));
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <About />
    </Provider>
  );

  return dispatch;
};

describe('About connected to the store', () => {
  it('shows nothing before the main process reported', () => {
    setup([]);

    expect(screen.queryByText('About')).toBeNull();
  });

  it('shows the reported version and dispatches the check', () => {
    const dispatch = setup([{ type: 'UPDATE_STATE', payload: state }]);

    expect(screen.getByText('Version 26.10.5')).toBeTruthy();
    fireEvent.click(screen.getByText('Check for updates'));

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'CHECK_FOR_UPDATES' });
  });

  it('dispatches the install of a downloaded update when nothing plays', () => {
    const dispatch = setup([{ type: 'UPDATE_STATE', payload: { ...state, status: { kind: 'ready', version: '26.10.6' } } }]);

    fireEvent.click(screen.getByText('Restart to install'));

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'INSTALL_UPDATE' });
  });

  it('asks before the install while it plays', () => {
    const dispatch = setup([
      { type: 'UPDATE_STATE', payload: { ...state, status: { kind: 'ready', version: '26.10.6' } } },
      { type: 'SET_PLAYING', payload: { isPlaying: true } },
    ]);

    fireEvent.click(screen.getByText('Restart to install'));

    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText('The playback stops for the restart. The queue and the position are kept.')).toBeTruthy();
  });

  it('dispatches the choice to update at start', () => {
    const dispatch = setup([{ type: 'UPDATE_STATE', payload: state }]);

    fireEvent.click(screen.getByRole('switch', { name: 'Update at start' }));

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'SET_AUTOMATIC_UPDATES', payload: { enabled: false } });
  });

  it('dispatches opening the releases where updates do not apply', () => {
    const dispatch = setup([{ type: 'UPDATE_STATE', payload: { ...state, unavailable: 'flatpak' } }]);

    fireEvent.click(screen.getByText('Open the releases page'));

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'OPEN_RELEASES' });
  });
});
