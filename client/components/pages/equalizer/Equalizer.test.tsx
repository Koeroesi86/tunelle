import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Equalizer from './Equalizer';
import { defaultGains, equalizerPresets } from '../../../audio/equalizer';
import { equalizerBands } from '../../../constants/equalizer';

const createFilter = () => {
  const filter = {
    type: 'lowpass',
    frequency: { value: 0 },
    gain: { value: 0 },
    connect: vi.fn(),
  };
  return filter as typeof filter & BiquadFilterNode;
};

type EqualizerProps = Parameters<typeof Equalizer>[0];

/** Keeps the faders choice the way the store does */
const StatefulEqualizer = (props: Omit<EqualizerProps, 'showFaders' | 'setShowFaders'>) => {
  const [showFaders, setShowFaders] = useState(false);
  return <Equalizer {...props} showFaders={showFaders} setShowFaders={setShowFaders} />;
};

const setup = (gains = defaultGains) => {
  const filters: ReturnType<typeof createFilter>[] = [];
  let mounted = () => {};
  const props = {
    gains,
    createBiquadFilter: () => {
      const filter = createFilter();
      filters.push(filter);
      return filter;
    },
    connectToSource: vi.fn(),
    connectDestination: vi.fn(),
    onAudioMounted: (listener: () => void) => {
      mounted = listener;
    },
    setGain: vi.fn(),
    setGains: vi.fn(),
  };
  const view = render(<StatefulEqualizer {...props} />);
  return { props, filters, view, mount: () => mounted() };
};

describe('Equalizer', () => {
  it('chains the filters in series from the source to the destination', () => {
    const { props, filters, mount } = setup();
    mount();

    expect(filters).toHaveLength(equalizerBands.length);
    filters.slice(0, -1).forEach((filter, index) => expect(filter.connect).toHaveBeenCalledExactlyOnceWith(filters[index + 1]));
    expect(props.connectToSource).toHaveBeenCalledExactlyOnceWith(filters[0]);
    expect(props.connectDestination).toHaveBeenCalledExactlyOnceWith(filters[filters.length - 1]);
    expect(filters.map((filter) => filter.type)).toEqual(['lowshelf', ...Array(8).fill('peaking'), 'highshelf']);
  });

  it('builds a new chain each time the audio is mounted, as the nodes of an old audio context cannot join a new one', () => {
    const { filters, mount } = setup();
    mount();
    mount();

    expect(filters).toHaveLength(equalizerBands.length * 2);
  });

  it('applies the gains and follows changes', () => {
    const gains = defaultGains.map((_, index) => index);
    const { filters, view, mount, props } = setup(gains);
    mount();
    expect(filters.map((filter) => filter.gain.value)).toEqual(gains);

    view.rerender(<StatefulEqualizer {...props} gains={gains.map((gain) => gain + 1)} />);
    expect(filters.map((filter) => filter.gain.value)).toEqual(gains.map((gain) => gain + 1));
  });

  it('keeps the faders hidden until they are asked for', () => {
    const { view } = setup();
    expect(view.container.querySelectorAll('input[type="range"]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Faders' }));
    expect(view.container.querySelectorAll('input[type="range"]')).toHaveLength(equalizerBands.length);

    fireEvent.click(screen.getByRole('button', { name: 'Hide faders' }));
    expect(view.container.querySelectorAll('input[type="range"]')).toHaveLength(0);
  });

  it('reports a fader change with its band', () => {
    const { props, view } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Faders' }));

    fireEvent.input(view.container.querySelectorAll('input[type="range"]')[3], { target: { value: '4' } });

    expect(props.setGain).toHaveBeenCalledWith(3, '4');
  });

  it('sets the gains of a preset and marks the one the gains are', () => {
    const bass = equalizerPresets.find(({ id }) => id === 'bass')?.gains ?? [];
    const { props } = setup(bass);

    expect(screen.getByRole('button', { name: 'Bass boost' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Flat' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Custom')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Vocal' }));
    expect(props.setGains).toHaveBeenCalledExactlyOnceWith(equalizerPresets.find(({ id }) => id === 'vocal')?.gains);
  });

  it('shows Custom when the gains are no preset, and resets them', () => {
    const { props } = setup(defaultGains.map((_, index) => (index === 2 ? 1.5 : 0)));

    expect(screen.getByText('Custom')).toBeTruthy();
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(props.setGains).toHaveBeenCalledExactlyOnceWith(defaultGains);
  });

  it('has nothing to reset when the curve is flat', () => {
    setup();

    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Flat' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('moves a dot of the curve with the arrow keys within the range', () => {
    const { props } = setup(defaultGains.map((_, index) => (index === 0 ? 12 : 0)));
    const dots = screen.getAllByRole('slider');

    expect(dots).toHaveLength(equalizerBands.length);
    expect(dots[1].getAttribute('aria-valuetext')).toBe('0 dB');
    fireEvent.keyDown(dots[1], { key: 'ArrowUp' });
    expect(props.setGain).toHaveBeenLastCalledWith(1, 0.5);
    fireEvent.keyDown(dots[1], { key: 'PageDown' });
    expect(props.setGain).toHaveBeenLastCalledWith(1, -3);
    fireEvent.keyDown(dots[0], { key: 'ArrowUp' });
    expect(props.setGain).toHaveBeenLastCalledWith(0, 12);
  });

  it('sets the gain under the pointer while a dot is dragged', () => {
    const { props, view } = setup();
    const plot = view.container.querySelector('[role="slider"]')?.parentElement;
    if (!plot) throw new Error('no plot');
    plot.getBoundingClientRect = () => new DOMRect(0, 100, 400, 240);
    const dot = screen.getAllByRole('slider')[4];

    fireEvent.pointerDown(dot, { clientY: 100 });
    expect(props.setGain).toHaveBeenLastCalledWith(4, 12);
    fireEvent.pointerMove(window, { clientY: 220 });
    expect(props.setGain).toHaveBeenLastCalledWith(4, 0);
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientY: 340 });
    expect(props.setGain).toHaveBeenCalledTimes(2);
  });
});
