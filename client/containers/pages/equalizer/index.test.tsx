import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../../redux/reducers';
import Equalizer from './index';
import View from '../../../components/pages/equalizer/Equalizer';
import { propsOf, renderContainer } from '../../../test/render-container';

vi.mock('../../../components/pages/equalizer/Equalizer', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../components/pages/equalizer/Equalizer')>();
  return { default: vi.fn(original.default) };
});

// the real context opens an audio context, which the test page does not have
vi.mock('../../../audio/context', async () => {
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

describe('the container of Equalizer', () => {
  it('sets one band or all of them', () => {
    const { sent } = renderContainer(<Equalizer />);
    const { setGain, setGains, setShowFaders } = propsOf(View);

    setGain(2, 3);
    setGains([1, 2]);
    setShowFaders(true);

    expect(sent()).toEqual([
      { type: 'SET_GAIN', payload: { index: 2, value: 3 } },
      { type: 'SET_GAINS', payload: { gains: [1, 2] } },
      { type: 'SET_SHOW_FADERS', payload: { show: true } },
    ]);
  });
});
