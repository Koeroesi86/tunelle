import { screen } from 'electron';
import type { Rectangle } from 'electron';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

/** The smallest the window gets, which the layout is built for (docs/development/responsive-layout.md) */
export const minWindowSize = { width: 360, height: 480 } as const;

/** How much of the window has to lie on a display for it to count as reachable, in px */
const reachable = { width: 100, height: 50 } as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const overlap = (start: number, size: number, areaStart: number, areaSize: number) => Math.min(start + size, areaStart + areaSize) - Math.max(start, areaStart);

const isReachableOn = (area: Rectangle, x: number, y: number, width: number, height: number) =>
  overlap(x, width, area.x, area.width) >= reachable.width && overlap(y, height, area.y, area.height) >= reachable.height;

/**
 * The saved bounds, made usable on the displays there are now: not smaller than the minimum, not larger than the display it is on,
 * and centered on the primary display when no display shows enough of it (a display that was unplugged or changed its resolution).
 */
export const correctWindowBounds = ({ x, y, width, height }: WindowBounds): WindowBounds => {
  const minimal = { width: Math.max(width, minWindowSize.width), height: Math.max(height, minWindowSize.height) };
  const area =
    x === undefined || y === undefined
      ? undefined
      : screen
          .getAllDisplays()
          .map((display) => display.workArea)
          .find((workArea) => isReachableOn(workArea, x, y, minimal.width, minimal.height));
  const target = area ?? screen.getPrimaryDisplay().workArea;
  const size = {
    width: clamp(minimal.width, minWindowSize.width, Math.max(minWindowSize.width, target.width)),
    height: clamp(minimal.height, minWindowSize.height, Math.max(minWindowSize.height, target.height)),
  };

  if (!area || x === undefined || y === undefined) {
    return { ...size, x: target.x + Math.round((target.width - size.width) / 2), y: target.y + Math.round((target.height - size.height) / 2) };
  }
  return { ...size, x: clamp(x, target.x, target.x + target.width - size.width), y: clamp(y, target.y, target.y + target.height - size.height) };
};
