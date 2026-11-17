import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RemoteListenerState } from '@shared/schemas/remote-listener';
import RemoteListener from './RemoteListener';

const target = { host: '192.168.1.5', port: 40000 };

const setup = (state: RemoteListenerState | undefined) => {
  const props = { state, connect: vi.fn(), confirm: vi.fn(), leave: vi.fn(), listenAlong: vi.fn() };
  const view = render(<RemoteListener {...props} />);
  return { ...props, ...view };
};

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('RemoteListener', () => {
  it('shows nothing until the main process reported', () => {
    expect(setup(undefined).container.innerHTML).toBe('');
  });

  it('connects to the address and port that were typed, and not to a port that is out of range', () => {
    const { connect } = setup({ status: 'idle' });
    const button = screen.getByRole('button', { name: 'Connect' });

    type('Address', ' 192.168.1.5 ');
    type('Port', '80');
    expect(button.hasAttribute('disabled')).toBe(true);

    type('Port', '40000');
    fireEvent.click(button);

    expect(connect).toHaveBeenCalledExactlyOnceWith('192.168.1.5', 40000);
  });

  it('shows why the last try ended, and offers the form again', () => {
    setup({ status: 'error', target, error: 'connect ECONNREFUSED' });

    expect(screen.getByText('Could not reach the host: connect ECONNREFUSED')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Address').value).toBe('192.168.1.5');
    expect(screen.getByLabelText<HTMLInputElement>('Port').value).toBe('40000');
  });

  it.each([
    ['blocked', 'The host blocked this device.'],
    ['revoked', 'The host does not know this device any more. Ask again.'],
  ] as const)('says when the host %s the device', (status, text) => {
    setup({ status, target });

    expect(screen.getByText(text)).toBeTruthy();
  });

  it('shows the code to compare, and asks only after the user said that the codes match', () => {
    const { confirm, leave } = setup({ status: 'confirming', target, code: 'AB12-CD34' });

    expect(screen.getByText(/AB12-CD34/)).toBeTruthy();
    type('A note for the host (optional)', ' the kitchen ');
    fireEvent.click(screen.getByRole('button', { name: 'The codes match, ask to listen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(confirm).toHaveBeenCalledExactlyOnceWith('the kitchen');
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('waits for the approval and can be cancelled', () => {
    const { leave } = setup({ status: 'waiting', target, code: 'AB12-CD34' });

    expect(screen.getByText('Waiting for 192.168.1.5:40000 to approve this device. Code: AB12-CD34.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('shows what the host plays, as text, and stops listening on request', () => {
    const { leave } = setup({ status: 'listening', target, nowPlaying: { state: 'playing', title: '<b>Song</b>', artist: 'Band', position: 1, at: 0 } });

    expect(screen.getByText('Listening to 192.168.1.5:40000')).toBeTruthy();
    expect(screen.getByText('<b>Song</b> – Band')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('plays along with what the host plays', () => {
    const nowPlaying = { state: 'playing' as const, title: 'Song', artist: 'Band', position: 1, at: 0 };
    const { listenAlong } = setup({ status: 'listening', target, nowPlaying });

    fireEvent.click(screen.getByRole('button', { name: 'Listen along' }));

    expect(listenAlong).toHaveBeenCalledWith(nowPlaying);
  });

  it('has nothing to listen along with while the host plays nothing', () => {
    setup({ status: 'listening', target, nowPlaying: { state: 'idle' } });

    expect(screen.queryByRole('button', { name: 'Listen along' })).toBeNull();
  });

  it('says so when nothing plays on the host, and shows a failed poll beside the last state', () => {
    setup({ status: 'listening', target, nowPlaying: { state: 'idle' }, error: 'The host did not answer' });

    expect(screen.getByText('Nothing plays on the host.')).toBeTruthy();
    expect(screen.getByText('Could not reach the host: The host did not answer')).toBeTruthy();
  });
});
