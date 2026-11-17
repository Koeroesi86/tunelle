import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RemoteHostState } from '@shared/schemas/remote-host';
import RemoteAccess from './RemoteAccess';

const phone = '0b9c3d3e-5a53-4a43-9a4c-0c1d6f6f0e01';
const tablet = '0b9c3d3e-5a53-4a43-9a4c-0c1d6f6f0e02';
const state = (change: Partial<RemoteHostState> = {}): RemoteHostState => ({
  enabled: true,
  name: 'Tunelle',
  loopbackOnly: false,
  running: true,
  code: 'AB12',
  pending: [],
  devices: [],
  ...change,
});

const setup = (current: RemoteHostState | undefined) => {
  const props = { state: current, setEnabled: vi.fn(), decide: vi.fn(), setControls: vi.fn() };
  render(<RemoteAccess {...props} />);
  return props;
};

describe('RemoteAccess', () => {
  it('shows nothing until the main process reported', () => {
    const { container } = render(<RemoteAccess state={undefined} setEnabled={vi.fn()} decide={vi.fn()} setControls={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('turns the host on and off with the switch', () => {
    const props = setup(state({ enabled: false, running: false }));

    fireEvent.click(screen.getByRole('switch', { name: 'Remote listening' }));

    expect(props.setEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('shows the code while it listens, and why it could not start', () => {
    setup(state({ error: 'The port is taken' }));

    expect(screen.getByText(/AB12/)).toBeTruthy();
    expect(screen.getByText('Remote listening could not start: The port is taken')).toBeTruthy();
  });

  it('shows no code while it does not listen', () => {
    setup(state({ enabled: false, running: false, code: 'AB12' }));

    expect(screen.queryByText(/AB12/)).toBeNull();
  });

  it('approves or denies a device that waits, and shows its note as text', () => {
    const props = setup(state({ pending: [{ deviceId: phone, deviceName: 'Phone', note: '<b>Hi</b>', at: 1 }] }));

    expect(screen.getByText('<b>Hi</b>')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(props.decide.mock.calls).toEqual([
      [phone, 'approve'],
      [phone, 'deny'],
    ]);
  });

  it('revokes and blocks an approved device', () => {
    const props = setup(state({ devices: [{ id: phone, name: 'Phone', blocked: false, controls: [] }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));

    expect(props.decide.mock.calls).toEqual([
      [phone, 'revoke'],
      [phone, 'block'],
    ]);
  });

  it('gives and takes a control, and keeps the ones it does not list', () => {
    const props = setup(state({ devices: [{ id: phone, name: 'Phone', blocked: false, controls: ['volume', 'queue'] }] }));
    const group = screen.getByRole('group', { name: 'What Phone may control' });

    fireEvent.click(within(group).getByRole('checkbox', { name: 'Skip' }));
    fireEvent.click(within(group).getByRole('checkbox', { name: 'Volume' }));

    expect(props.setControls.mock.calls).toEqual([
      [phone, ['volume', 'queue', 'skip']],
      [phone, ['queue']],
    ]);
    expect(within(group).queryByRole('checkbox', { name: /queue/i })).toBeNull();
  });

  it('shows a blocked device with no controls, and lets it be unblocked', () => {
    const props = setup(state({ devices: [{ id: tablet, name: 'Tablet', blocked: true, controls: [] }] }));

    expect(screen.getByText('Blocked')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));

    expect(props.decide).toHaveBeenCalledExactlyOnceWith(tablet, 'revoke');
  });
});
