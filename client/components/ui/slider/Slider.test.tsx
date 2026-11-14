import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { expectNoViolations } from '../../../test/expect-no-violations';
import Slider from './Slider';

describe('Slider', () => {
  it.each([
    [-12, 0],
    [0, 50],
    [12, 100],
  ])('fills a -12..12 slider at %s to %s%%', (value, percent) => {
    const { container } = render(<Slider min={-12} max={12} step={1} value={value} orientation="vertical" label="Gain" onInput={() => {}} />);

    expect(container.querySelector<HTMLElement>('input + div')?.style.height).toBe(`${percent}%`);
  });

  it('is named and tells its value in words', () => {
    const { container } = render(<Slider max={100} value={30} label="Volume" valueText="30%" onInput={() => {}} />);
    const input = container.querySelector('input');

    expect(input?.getAttribute('aria-label')).toBe('Volume');
    expect(input?.getAttribute('aria-valuetext')).toBe('30%');
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<Slider max={100} value={30} label="Volume" valueText="30%" onInput={() => {}} />);

    await expectNoViolations(container);
  });
});
