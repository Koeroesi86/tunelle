import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LoudnessNormalization from './LoudnessNormalization';

describe('LoudnessNormalization', () => {
  it('shows the mode that is on, with what it does', () => {
    render(<LoudnessNormalization mode="album" setMode={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Album' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/differences between the tracks of an album/)).toBeTruthy();
  });

  it.each([
    ['Off', 'off'],
    ['Track', 'track'],
  ])('picks %s', (name, mode) => {
    const setMode = vi.fn();
    render(<LoudnessNormalization mode="album" setMode={setMode} />);

    fireEvent.click(screen.getByRole('radio', { name }));

    expect(setMode).toHaveBeenCalledExactlyOnceWith(mode);
  });
});
