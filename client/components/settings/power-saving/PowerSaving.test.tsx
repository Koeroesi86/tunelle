import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PowerSaving from './PowerSaving';

describe('PowerSaving', () => {
  it('offers the three modes, with the picked one selected', () => {
    render(<PowerSaving mode="always" saving={false} setMode={vi.fn()} />);

    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Save power' });
    expect(select.value).toBe('always');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['On battery', 'Always', 'Never']);
  });

  it('picks a mode', () => {
    const setMode = vi.fn();
    render(<PowerSaving mode="auto" saving={false} setMode={setMode} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Save power' }), { target: { value: 'never' } });

    expect(setMode).toHaveBeenCalledExactlyOnceWith('never');
  });

  it('says whether power is saved now', () => {
    const { rerender } = render(<PowerSaving mode="auto" saving setMode={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Saving power now.');

    rerender(<PowerSaving mode="auto" saving={false} setMode={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Not saving power now.');
  });
});
