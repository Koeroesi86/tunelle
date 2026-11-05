import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Wordmark from './Wordmark';

describe('Wordmark', () => {
  it('is named for the screen readers', () => {
    render(<Wordmark />);

    expect(screen.getByRole('img', { name: 'Tunelle' })).toBeTruthy();
  });

  it('draws five letters and two bars, the bars in the gradient of the icon', () => {
    const { container } = render(<Wordmark />);
    const gradient = container.querySelector('linearGradient')?.id;

    expect(container.querySelectorAll('path')).toHaveLength(5);
    expect(Array.from(container.querySelectorAll('line')).map((bar) => bar.getAttribute('stroke'))).toEqual([`url(#${gradient})`, `url(#${gradient})`]);
  });

  it('gives each mark a gradient of its own, so two on a page do not share one', () => {
    const { container } = render(
      <>
        <Wordmark />
        <Wordmark />
      </>
    );
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((gradient) => gradient.id);

    expect(new Set(ids).size).toBe(2);
  });
});
