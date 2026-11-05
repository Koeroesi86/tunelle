import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Time from './Time';

describe('Time', () => {
  it.each([
    [0, '00:00:00'],
    [59.9, '00:00:59'],
    [3725, '01:02:05'],
    ['61', '00:01:01'],
    [undefined, '00:00:00'],
    [null, '00:00:00'],
  ])('shows %s as %s regardless of the time zone', (seconds, expected) => {
    expect(render(<Time seconds={seconds} />).container.textContent).toBe(expected);
  });
});
