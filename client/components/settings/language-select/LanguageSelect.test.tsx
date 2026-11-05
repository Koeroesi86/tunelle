import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LanguageSelect from './LanguageSelect';

describe('LanguageSelect', () => {
  it('offers the system default and every language by its own name', () => {
    render(<LanguageSelect setLanguage={vi.fn()} />);

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['System default', 'English', 'Magyar']);
  });

  it('follows the system until a language is picked', () => {
    render(<LanguageSelect setLanguage={vi.fn()} />);

    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('');
  });

  it('shows the picked language', () => {
    render(<LanguageSelect language="hu" setLanguage={vi.fn()} />);

    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('hu');
  });

  it('picks a language, and goes back to the system default with undefined', () => {
    const setLanguage = vi.fn();
    render(<LanguageSelect language="hu" setLanguage={setLanguage} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    expect(setLanguage.mock.calls).toEqual([['en'], [undefined]]);
  });
});
