import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import AudioSpectrum from './AudioSpectrum';

describe('AudioSpectrum', () => {
  let frame = 0;
  const cancelAnimationFrame = vi.fn();

  beforeEach(() => {
    frame = 0;
    cancelAnimationFrame.mockReset();
    vi.stubGlobal('requestAnimationFrame', () => ++frame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ createLinearGradient: () => ({ addColorStop: vi.fn() }), clearRect: vi.fn(), fillRect: vi.fn() }) as unknown as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stops the running animation before it starts another', () => {
    let notify: (isPlaying: boolean) => void = () => {};
    render(
      <AudioSpectrum
        createAnalyser={() => undefined}
        addPlayStatusListener={(listener) => {
          notify = listener;
        }}
      />
    );

    notify(true);
    notify(true);

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  describe('colors', () => {
    const root = document.documentElement;
    let fills: unknown[] = [];

    const drawOneFrame = (colors: { meterColor?: string; capColor?: string } = {}) => {
      fills = [];
      const context = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        set fillStyle(value: unknown) {
          fills.push(value);
        },
      };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as unknown as CanvasRenderingContext2D);
      let frames = 0;
      vi.stubGlobal('requestAnimationFrame', (draw: FrameRequestCallback) => {
        if (frames++ === 0) draw(0);
        return frames;
      });
      const analyser = { frequencyBinCount: 4, getByteFrequencyData: (data: Uint8Array) => data.fill(100) } as unknown as AnalyserNode;
      let notify: (isPlaying: boolean) => void = () => {};
      render(
        <AudioSpectrum
          meterCount={1}
          {...colors}
          createAnalyser={() => analyser}
          addPlayStatusListener={(listener) => {
            notify = listener;
          }}
        />
      );

      notify(true);
    };

    afterEach(() => root.removeAttribute('style'));

    it('draws the caps and the meters with the colors of the theme', () => {
      root.style.setProperty('--spectrum-cap', '#112233');
      root.style.setProperty('--spectrum-meter', '#445566');

      drawOneFrame();

      expect(fills).toEqual(['#112233', '#445566']);
    });

    it('draws with the new accent as soon as the theme sets it', () => {
      root.style.setProperty('--spectrum-cap', '#112233');
      root.style.setProperty('--spectrum-meter', '#445566');
      drawOneFrame();
      cleanup();

      root.style.setProperty('--spectrum-cap', '#aabbcc');
      root.style.setProperty('--spectrum-meter', '#ddeeff');
      drawOneFrame();

      expect(fills).toEqual(['#aabbcc', '#ddeeff']);
    });

    it('prefers the colors it is given', () => {
      root.style.setProperty('--spectrum-cap', '#112233');

      drawOneFrame({ capColor: '#ffffff', meterColor: '#000000' });

      expect(fills).toEqual(['#ffffff', '#000000']);
    });
  });
});
