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
  maxListeners: 5,
  running: true,
  addresses: ['192.168.1.30'],
  code: 'AB12',
  pending: [],
  devices: [],
  ...change,
});

const setup = (current: RemoteHostState | undefined) => {
  const props = { state: current, setEnabled: vi.fn(), update: vi.fn(), decide: vi.fn(), setControls: vi.fn() };
  render(<RemoteAccess {...props} />);
  return props;
};

describe('RemoteAccess', () => {
  it('shows nothing until the main process reported', () => {
    const { container } = render(<RemoteAccess state={undefined} setEnabled={vi.fn()} update={vi.fn()} decide={vi.fn()} setControls={vi.fn()} />);

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

  it('shows no code and no port while it does not listen', () => {
    setup(state({ enabled: false, running: false, code: 'AB12', port: 40000 }));

    expect(screen.queryByText(/AB12/)).toBeNull();
    expect(screen.queryByText(/40000/)).toBeNull();
  });

  it('shows the port that a listener connects to while it listens', () => {
    setup(state({ port: 40000 }));

    expect(screen.getByText('Other devices connect to the port 40000 of this computer.')).toBeTruthy();
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
    expect(within(screen.getByRole('list', { name: 'Approved devices' })).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));

    expect(props.decide).toHaveBeenCalledExactlyOnceWith(tablet, 'revoke');
  });

  it('sends a new name when the field is left, and not an empty or an unchanged one', () => {
    const props = setup(state({ name: 'Kitchen' }));
    const field = screen.getByRole('textbox', { name: 'Name shown to other devices' });

    fireEvent.change(field, { target: { value: '  Living room  ' } });
    fireEvent.blur(field);
    expect(props.update).toHaveBeenCalledExactlyOnceWith({ name: 'Living room' });

    props.update.mockClear();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: 'Kitchen' } });
    fireEvent.blur(field);
    expect(props.update).not.toHaveBeenCalled();
  });

  it('sends the name on Enter', () => {
    const props = setup(state({ name: 'Kitchen' }));
    const field = screen.getByRole('textbox', { name: 'Name shown to other devices' });

    fireEvent.change(field, { target: { value: 'Hall' } });
    fireEvent.submit(field);

    expect(props.update).toHaveBeenCalledWith({ name: 'Hall' });
  });

  it('sends the most listeners and the fixed port when the field is left, and not a value out of range or the same', () => {
    const props = setup(state({ port: 41000 }));
    const most = screen.getByRole('textbox', { name: /Most devices listening at once/ });
    const port = screen.getByRole('textbox', { name: /^Port \(advanced/ });

    fireEvent.change(most, { target: { value: '0' } });
    fireEvent.blur(most);
    fireEvent.change(most, { target: { value: '3' } });
    fireEvent.blur(most);
    fireEvent.change(port, { target: { value: '80' } });
    fireEvent.blur(port);
    fireEvent.change(port, { target: { value: '41000' } });
    fireEvent.blur(port);
    fireEvent.change(port, { target: { value: '42000' } });
    fireEvent.submit(port);

    expect(props.update.mock.calls).toEqual([[{ maxListeners: 3 }], [{ port: 42000 }]]);
  });

  it('tells about the network permission while the host listens, and what to check when nobody connected, but not on this computer only', () => {
    const { unmount } = render(<RemoteAccess {...{ state: state(), setEnabled: vi.fn(), update: vi.fn(), decide: vi.fn(), setControls: vi.fn() }} />);
    expect(screen.getByText(/may ask to allow network access/)).toBeTruthy();
    expect(screen.getByText(/client isolation/)).toBeTruthy();
    unmount();

    setup(state({ loopbackOnly: true }));
    expect(screen.queryByText(/may ask to allow network access/)).toBeNull();
    expect(screen.queryByText(/client isolation/)).toBeNull();
  });

  it('disconnects an approved device without revoking it', () => {
    const props = setup(state({ devices: [{ id: phone, name: 'Phone', blocked: false, controls: [] }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(props.decide).toHaveBeenCalledExactlyOnceWith(phone, 'disconnect');
  });

  it('switches the host to this computer only and back', () => {
    const props = setup(state({ loopbackOnly: false }));

    fireEvent.click(screen.getByRole('checkbox', { name: /Only this computer can connect/ }));

    expect(props.update).toHaveBeenCalledExactlyOnceWith({ loopbackOnly: true });
  });
});
