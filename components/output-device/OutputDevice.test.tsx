import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OutputDevice from './OutputDevice';

const dac = { id: 'a1', label: 'USB DAC' };
const speakers = { id: 'b2', label: 'Speakers' };

describe('OutputDevice', () => {
  it('offers the system default and every device', () => {
    render(<OutputDevice devices={[dac, speakers]} setDevice={vi.fn()} />);

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['System default', 'USB DAC', 'Speakers']);
  });

  it('names a device the system gives no name', () => {
    render(<OutputDevice devices={[{ id: 'x', label: '' }]} setDevice={vi.fn()} />);

    expect(screen.getByRole('option', { name: 'Output device 1' })).toBeTruthy();
  });

  it('shows the chosen device, also when its id changed', () => {
    render(<OutputDevice device={{ id: 'old', label: 'USB DAC' }} devices={[speakers, dac]} setDevice={vi.fn()} />);

    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('a1');
  });

  it('picks a device, and goes back to the default with undefined', () => {
    const setDevice = vi.fn();
    render(<OutputDevice device={dac} devices={[dac, speakers]} setDevice={setDevice} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b2' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    expect(setDevice.mock.calls).toEqual([[speakers], [undefined]]);
  });

  it('says so when the chosen device is unplugged, and plays on the default', () => {
    render(<OutputDevice device={dac} devices={[speakers]} setDevice={vi.fn()} />);

    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('');
    expect(screen.getByText(/not connected/)).toBeTruthy();
  });
});
