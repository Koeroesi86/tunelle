import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import StationLogo from './StationLogo';

describe('StationLogo', () => {
  it('shows the logo served for the uuid of the station', () => {
    const { container } = render(<StationLogo uuid="a b" hasLogo />);

    expect(container.querySelector('img')?.getAttribute('src')).toContain('/radio-logo/a%20b');
  });

  it('shows the fallback for a station without a logo', () => {
    const { container, getByText } = render(<StationLogo uuid="a" fallback={<i>radio</i>} />);

    expect(container.querySelector('img')).toBeNull();
    expect(getByText('radio')).toBeTruthy();
  });

  it('falls back when the logo does not load', () => {
    const { container, getByText } = render(<StationLogo uuid="a" hasLogo fallback={<i>radio</i>} />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(getByText('radio')).toBeTruthy();
  });
});
