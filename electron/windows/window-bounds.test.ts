import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from 'electron';
import { correctWindowBounds, minWindowSize } from './window-bounds';

vi.mock('electron', () => ({ screen: { getAllDisplays: vi.fn(), getPrimaryDisplay: vi.fn() } }));

const display = (x: number, y: number, width: number, height: number) => ({ workArea: { x, y, width, height } });

const useDisplays = (...displays: ReturnType<typeof display>[]) => {
  vi.mocked(screen.getAllDisplays).mockReturnValue(displays as never);
  vi.mocked(screen.getPrimaryDisplay).mockReturnValue(displays[0] as never);
};

describe('correctWindowBounds', () => {
  beforeEach(() => {
    useDisplays(display(0, 0, 1920, 1080));
  });

  it('keeps bounds that fit', () => {
    expect(correctWindowBounds({ x: 100, y: 80, width: 1200, height: 800 })).toEqual({ x: 100, y: 80, width: 1200, height: 800 });
  });

  it('raises a size below the minimum', () => {
    expect(correctWindowBounds({ x: 10, y: 10, width: 100, height: 100 })).toEqual({ x: 10, y: 10, ...minWindowSize });
  });

  it('shrinks a window larger than its display', () => {
    expect(correctWindowBounds({ x: 0, y: 0, width: 4000, height: 3000 })).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('moves a window that sticks out of the display back in', () => {
    expect(correctWindowBounds({ x: 1500, y: 700, width: 800, height: 600 })).toEqual({ x: 1120, y: 480, width: 800, height: 600 });
  });

  it('centers a window on the primary display when its display is gone', () => {
    expect(correctWindowBounds({ x: 3000, y: 200, width: 800, height: 600 })).toEqual({ x: 560, y: 240, width: 800, height: 600 });
  });

  it('centers a window that has no position yet', () => {
    expect(correctWindowBounds({ width: 1000, height: 600 })).toEqual({ x: 460, y: 240, width: 1000, height: 600 });
  });

  it('keeps a window on the second display it is on', () => {
    useDisplays(display(0, 0, 1920, 1080), display(1920, 0, 1280, 720));

    expect(correctWindowBounds({ x: 2000, y: 20, width: 1000, height: 600 })).toEqual({ x: 2000, y: 20, width: 1000, height: 600 });
  });

  it('does not center a window on a display too small for the minimum size', () => {
    useDisplays(display(0, 0, 300, 400));

    expect(correctWindowBounds({ x: 0, y: 0, width: 800, height: 600 })).toEqual({ x: 0, y: 0, ...minWindowSize });
  });
});
