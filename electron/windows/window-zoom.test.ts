import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import registerWindowZoom, { nextZoomIndex, zoomFactors } from './window-zoom';

const press = (key: string, modifiers: { control?: boolean; meta?: boolean; alt?: boolean } = { control: true }) => ({
  type: 'keyDown' as const,
  key,
  control: false,
  meta: false,
  alt: false,
  ...modifiers,
});

describe('registerWindowZoom', () => {
  const setup = () => {
    let handler: (event: { preventDefault: () => void }, input: ReturnType<typeof press>) => void = () => {};
    const setZoomFactor = vi.fn();
    const webContents = {
      setZoomFactor,
      on: (_name: string, listener: typeof handler) => {
        handler = listener;
      },
    } as unknown as WebContents;
    registerWindowZoom(webContents);
    return {
      setZoomFactor,
      send: (input: ReturnType<typeof press>) => {
        const preventDefault = vi.fn();
        handler({ preventDefault }, input);
        return preventDefault;
      },
    };
  };

  it('zooms in and out one step at a time and back to 100% with zero', () => {
    const { setZoomFactor, send } = setup();

    send(press('='));
    send(press('+'));
    send(press('-'));
    send(press('0'));

    expect(setZoomFactor.mock.calls.map(([factor]) => factor)).toEqual([1.1, 1.25, 1.1, 1]);
  });

  it('takes the key it uses and leaves the others', () => {
    const { setZoomFactor, send } = setup();

    expect(send(press('+'))).toHaveBeenCalled();
    expect(send(press('a'))).not.toHaveBeenCalled();
    expect(send(press('+', {}))).not.toHaveBeenCalled();
    expect(send(press('+', { control: true, alt: true }))).not.toHaveBeenCalled();
    expect(setZoomFactor).toHaveBeenCalledTimes(1);
  });

  it('stops at the first and the last step', () => {
    expect(nextZoomIndex(press('-'), 0)).toBe(0);
    expect(nextZoomIndex(press('+'), zoomFactors.length - 1)).toBe(zoomFactors.length - 1);
    expect(nextZoomIndex(press('+', { meta: true }), 2)).toBe(3);
    expect(nextZoomIndex({ ...press('+'), type: 'keyUp' }, 2)).toBeUndefined();
  });
});
