import { describe, expect, it } from 'vitest';
import { drawCover } from './screenshot-media';
import type { CoverSpec } from './screenshot-media';

const spec: CoverSpec = {
  sky: [
    [10, 20, 60],
    [40, 90, 140],
  ],
  sun: [120, 230, 200],
  ground: [
    [48, 60, 150],
    [14, 20, 70],
  ],
  shape: 'waves',
};

describe('drawCover', () => {
  it('draws the same bytes every time', () => {
    expect(drawCover(spec, 64).equals(drawCover(spec, 64))).toBe(true);
  });

  it('is a PNG of the size asked for', () => {
    const png = drawCover(spec, 64);

    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64]);
  });

  const shapes: CoverSpec['shape'][] = ['mountains', 'waves', 'grid'];

  it.each(shapes)('draws %s differently from the others', (shape) => {
    const others = shapes.filter((other) => other !== shape);

    others.forEach((other) => expect(drawCover({ ...spec, shape }, 64).equals(drawCover({ ...spec, shape: other }, 64))).toBe(false));
  });
});
