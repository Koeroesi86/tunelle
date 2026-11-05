import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Slider from './Slider';

describe('Slider', () => {
  it.each([
    [-12, 0],
    [0, 50],
    [12, 100],
  ])('fills a -12..12 slider at %s to %s%%', (value, percent) => {
    const { container } = render(<Slider min={-12} max={12} step={1} value={value} orientation="vertical" onInput={() => {}} />);

    expect(container.querySelector<HTMLElement>('input + div')?.style.height).toBe(`${percent}%`);
  });
});
