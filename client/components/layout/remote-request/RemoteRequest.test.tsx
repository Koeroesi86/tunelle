import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RemoteRequest from './RemoteRequest';

const phone = '0b9c3d3e-5a53-4a43-9a4c-0c1d6f6f0e01';

describe('RemoteRequest', () => {
  it('asks nothing while no device waits', () => {
    render(<RemoteRequest request={undefined} code="AB12" decide={vi.fn()} />);

    expect(screen.queryByText(/asks to listen/)).toBeNull();
  });

  it('asks about the first device with its code and note', () => {
    render(<RemoteRequest request={{ deviceId: phone, deviceName: 'Phone', note: 'In the kitchen', at: 1 }} code="AB12" decide={vi.fn()} />);

    expect(screen.getByText(/Phone asks to listen to Tunelle. Code: AB12./)).toBeTruthy();
    expect(screen.getByText(/In the kitchen/)).toBeTruthy();
  });

  it('approves or denies it', () => {
    const decide = vi.fn();
    const { rerender } = render(<RemoteRequest request={{ deviceId: phone, deviceName: 'Phone', note: '', at: 1 }} code="AB12" decide={decide} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    rerender(<RemoteRequest request={undefined} code="AB12" decide={decide} />);

    expect(decide.mock.calls).toEqual([
      [phone, 'approve'],
      [phone, 'deny'],
    ]);
  });
});
