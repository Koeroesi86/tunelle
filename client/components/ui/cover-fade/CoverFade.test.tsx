import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import CoverFade from './CoverFade';

const loading: FakeImage[] = [];

class FakeImage {
  onload: () => void = () => {};
  onerror: () => void = () => {};
  src = '';

  constructor() {
    loading.push(this);
  }
}

const layers = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('span span')).map((layer) => layer.style.backgroundImage);
const finish = (index: number) => act(() => loading[index].onload());

describe('CoverFade', () => {
  beforeEach(() => {
    loading.length = 0;
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the cover it opens with at once, without a fade', () => {
    const { container } = render(<CoverFade src="one.jpg" />);

    expect(layers(container)).toEqual(['url("one.jpg")']);
    expect(container.querySelector('[class*="fadeIn"]')).toBeNull();
  });

  it('keeps showing the old cover until the new one has loaded', () => {
    const { container, rerender } = render(<CoverFade src="one.jpg" />);

    rerender(<CoverFade src="two.jpg" />);

    expect(loading[0].src).toBe('two.jpg');
    expect(layers(container)).toEqual(['url("one.jpg")']);
  });

  it('fades the new cover in over the old one, which goes when the fade has ended', () => {
    const { container, rerender } = render(<CoverFade src="one.jpg" />);
    rerender(<CoverFade src="two.jpg" />);

    finish(0);

    expect(layers(container)).toEqual(['url("one.jpg")', 'url("two.jpg")']);
    expect(container.querySelector('[class*="fadeIn"]')).not.toBeNull();

    act(() => container.querySelector('[class*="fadeIn"]')?.dispatchEvent(new Event('animationend', { bubbles: true })));

    expect(layers(container)).toEqual(['url("two.jpg")']);
  });

  it('skips a cover that a newer one has replaced while it loaded', () => {
    const { container, rerender } = render(<CoverFade src="one.jpg" />);
    rerender(<CoverFade src="two.jpg" />);
    rerender(<CoverFade src="three.jpg" />);

    finish(0);
    expect(layers(container)).toEqual(['url("one.jpg")']);

    finish(1);
    expect(layers(container)).toEqual(['url("one.jpg")', 'url("three.jpg")']);
  });

  it('shows the new cover when the old one failed to load', () => {
    const { container, rerender } = render(<CoverFade src="one.jpg" />);
    rerender(<CoverFade src="two.jpg" />);

    act(() => loading[0].onerror());

    expect(layers(container)).toContain('url("two.jpg")');
  });

  it('shows the placeholder at once when the cover goes', () => {
    const { container, rerender } = render(<CoverFade src="one.jpg" />);

    rerender(<CoverFade />);

    expect(layers(container)).toEqual([]);
  });
});
