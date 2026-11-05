import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../redux/reducers';
import Equalizer from './index';

// the real context opens an audio context, which the test page does not have
vi.mock('../../audio/context', async () => {
  const { createContext } = await import('react');
  const never = () => undefined;
  const node = () => ({ connect: never }) as unknown;
  return { Audio: createContext({ connectToSource: never, createBiquadFilter: node, connectDestination: never, onAudioMounted: never }) };
});

describe('Equalizer', () => {
  it('opens as it was left: the faders stay shown when the panel is mounted again', () => {
    const store = createStore(reducers);
    const panel = () => (
      <Provider store={store}>
        <Equalizer />
      </Provider>
    );
    render(panel());

    fireEvent.click(screen.getByRole('button', { name: 'Faders' }));
    cleanup();
    render(panel());

    expect(screen.getByRole('button', { name: 'Hide faders' })).toBeTruthy();
  });
});
