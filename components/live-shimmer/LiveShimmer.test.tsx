import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import LiveShimmer from './LiveShimmer';

describe('LiveShimmer', () => {
  it('lets the light sweep while it plays', () => {
    const { container } = render(<LiveShimmer isPlaying />);

    expect(container.firstElementChild?.classList.contains('playing')).toBe(true);
  });

  it('keeps the light out of sight when it does not play', () => {
    const { container } = render(<LiveShimmer isPlaying={false} />);

    expect(container.firstElementChild?.classList.contains('playing')).toBe(false);
  });

  it('is hidden from assistive technology as it only decorates', () => {
    const { container } = render(<LiveShimmer isPlaying />);

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});
