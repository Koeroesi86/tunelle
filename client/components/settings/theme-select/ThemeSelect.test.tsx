import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ThemeSettings } from '@shared/types/theme';
import { accentPresets, defaultAccent } from '../../../theme';
import ThemeSelect from './ThemeSelect';

const system: ThemeSettings = { mode: 'system', accent: undefined };

describe('ThemeSelect', () => {
  it('offers the system, light and dark modes and marks the picked one', () => {
    render(<ThemeSelect theme={{ mode: 'light', accent: undefined }} setMode={vi.fn()} setAccent={vi.fn()} />);

    expect(screen.getAllByRole('radio').map((radio) => [radio.textContent, radio.getAttribute('aria-checked')])).toEqual([
      ['System', 'false'],
      ['Light', 'true'],
      ['Dark', 'false'],
    ]);
  });

  it.each([
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['System', 'system'],
  ])('picks %s', (label, mode) => {
    const setMode = vi.fn();
    render(<ThemeSelect theme={{ mode: mode === 'system' ? 'dark' : 'system', accent: undefined }} setMode={setMode} setAccent={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: label }));

    expect(setMode).toHaveBeenCalledWith(mode);
  });

  it('offers the presets, with the default accent marked until another is picked', () => {
    render(<ThemeSelect theme={system} setMode={vi.fn()} setAccent={vi.fn()} />);

    expect(screen.getAllByRole('button', { pressed: true }).map((button) => button.getAttribute('aria-label'))).toEqual([`Accent colour ${defaultAccent}`]);
    expect(screen.getAllByRole('button', { name: /^Accent colour #/ })).toHaveLength(accentPresets.length);
  });

  it('picks a preset', () => {
    const setAccent = vi.fn();
    render(<ThemeSelect theme={system} setMode={vi.fn()} setAccent={setAccent} />);

    fireEvent.click(screen.getByRole('button', { name: `Accent colour ${accentPresets[1]}` }));

    expect(setAccent).toHaveBeenCalledWith(accentPresets[1]);
  });

  it('picking the default preset goes back to the default accent', () => {
    const setAccent = vi.fn();
    render(<ThemeSelect theme={{ mode: 'system', accent: accentPresets[1] }} setMode={vi.fn()} setAccent={setAccent} />);

    fireEvent.click(screen.getByRole('button', { name: `Accent colour ${defaultAccent}` }));

    expect(setAccent).toHaveBeenCalledWith(undefined);
  });

  it('picks a custom colour, and shows the one that is set', () => {
    const setAccent = vi.fn();
    render(<ThemeSelect theme={{ mode: 'system', accent: '#123456' }} setMode={vi.fn()} setAccent={setAccent} />);
    const input = screen.getByLabelText<HTMLInputElement>('Custom accent colour');

    expect(input.value).toBe('#123456');

    fireEvent.change(input, { target: { value: '#654321' } });

    expect(setAccent).toHaveBeenCalledWith('#654321');
  });

  it('resets the accent, which is only possible once one is picked', () => {
    const setAccent = vi.fn();
    const { rerender } = render(<ThemeSelect theme={system} setMode={vi.fn()} setAccent={setAccent} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Reset' }).disabled).toBe(true);

    rerender(<ThemeSelect theme={{ mode: 'system', accent: '#123456' }} setMode={vi.fn()} setAccent={setAccent} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(setAccent).toHaveBeenCalledWith(undefined);
  });

  it('offers the colour of the album art, marked while it is set and with no preset marked', () => {
    const setAccent = vi.fn();
    const { rerender } = render(<ThemeSelect theme={system} setMode={vi.fn()} setAccent={setAccent} />);
    const auto = screen.getByRole('button', { name: 'Automatic (from album art)' });
    expect(auto.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(auto);
    expect(setAccent).toHaveBeenCalledWith('auto');

    rerender(<ThemeSelect theme={{ mode: 'system', accent: 'auto' }} setMode={vi.fn()} setAccent={setAccent} />);
    expect(auto.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button', { pressed: true })).toEqual([auto]);
  });
});
