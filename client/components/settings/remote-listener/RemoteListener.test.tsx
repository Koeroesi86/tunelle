import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RemoteListenerState } from '@shared/schemas/remote-listener';
import type { NearbyHost } from '@shared/schemas/remote-nearby';
import RemoteListener from './RemoteListener';

const target = { host: '192.168.1.5', port: 40000 };

const setup = (state: RemoteListenerState | undefined, nearby: NearbyHost[] = []) => {
  const props = { state, connect: vi.fn(), confirm: vi.fn(), leave: vi.fn(), control: vi.fn(), listenAlong: vi.fn(), nearby, browse: vi.fn() };
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

  it('shows the buttons of the controls the host allowed, sends the command of each, and none of the others', () => {
    const playing = { state: 'playing', title: 'Song', position: 1, at: 0, duration: 200 } as const;
    const { control } = setup({ status: 'listening', target, nowPlaying: playing, controls: ['playPause', 'skip', 'volume'] });
    const group = screen.getByRole('group', { name: 'Controls of the host' });

    fireEvent.click(within(group).getByRole('button', { name: 'Play or pause' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Previous' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Next' }));
    const volume = within(group).getByRole('slider', { name: 'Volume of the host' });
    fireEvent.change(volume, { target: { value: '30' } });
    expect(control).toHaveBeenCalledTimes(3);
    fireEvent.pointerUp(volume);

    expect(control.mock.calls).toEqual([
      [{ control: 'playPause', action: 'toggle' }],
      [{ control: 'skip', direction: 'previous' }],
      [{ control: 'skip', direction: 'next' }],
      [{ control: 'volume', level: 0.3 }],
    ]);
    expect(within(group).queryByRole('slider', { name: 'Position on the host' })).toBeNull();
  });

  it('sends the position of the slider when the host allowed seeking and a track has a length, and shows no controls when none is allowed', () => {
    const playing = { state: 'playing', title: 'Song', position: 1, at: 0, duration: 200 } as const;
    const { control, unmount } = setup({ status: 'listening', target, nowPlaying: playing, controls: ['seek'] });

    const seek = screen.getByRole('slider', { name: 'Position on the host' });
    fireEvent.change(seek, { target: { value: '90' } });
    fireEvent.keyUp(seek);
    expect(control).toHaveBeenCalledExactlyOnceWith({ control: 'seek', position: 90 });
    unmount();

    setup({ status: 'listening', target, nowPlaying: playing, controls: [] });
    expect(screen.queryByRole('group', { name: 'Controls of the host' })).toBeNull();
  });

  it('shows what the host plays, as text, and stops listening on request', () => {
    const { leave } = setup({ status: 'listening', target, nowPlaying: { state: 'playing', title: '<b>Song</b>', artist: 'Band', position: 1, at: 0 } });

    expect(screen.getByText('Listening to 192.168.1.5:40000')).toBeTruthy();
    expect(screen.getByText('<b>Song</b> – Band')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    expect(leave).toHaveBeenCalledTimes(1);
  });

  describe('the Tunelles on the network', () => {
    const kitchen = { id: 'tunelle-a', name: 'Kitchen', host: '192.168.1.30', port: 41000, version: '1' };

    it('looks for them while the tile is shown, and stops when it goes away', () => {
      const { browse, unmount } = setup({ status: 'idle' });

      expect(browse).toHaveBeenCalledWith(true);
      expect(screen.getByText(/Looking for Tunelles/)).toBeTruthy();

      unmount();
      expect(browse).toHaveBeenLastCalledWith(false);
    });

    it('asks to listen to the one that was picked, at its address, and shows its name as text', () => {
      const { connect } = setup({ status: 'idle' }, [{ ...kitchen, name: '<b>Kitchen</b>' }]);

      fireEvent.click(screen.getByRole('button', { name: 'Connect to <b>Kitchen</b>' }));

      expect(connect).toHaveBeenCalledWith('192.168.1.30', 41000);
    });

    it('shows each host as not paired, waiting, approved or blocked, by what the app does with that address', () => {
      const bedroom = { ...kitchen, id: 'tunelle-b', name: 'Bedroom', host: '192.168.1.31' };
      const at = { host: kitchen.host, port: kitchen.port };
      const statuses = (state: Parameters<typeof setup>[0]) => {
        const { unmount } = setup(state, [kitchen, bedroom]);
        const found = screen.getAllByText(/Not paired|Waiting for approval|Approved|Blocked/).map((node) => node.textContent);
        unmount();
        return found;
      };

      expect(statuses({ status: 'idle' })).toEqual(['Not paired', 'Not paired']);
      expect(statuses({ status: 'waiting', target: at })).toEqual(['Waiting for approval', 'Not paired']);
      expect(statuses({ status: 'listening', target: at })).toEqual(['Approved', 'Not paired']);
      expect(statuses({ status: 'blocked', target: at })).toEqual(['Blocked', 'Not paired']);
      expect(statuses({ status: 'revoked', target: at })).toEqual(['Not paired', 'Not paired']);
    });

    it('keeps looking while the app waits or listens, and does not connect again to the host that is paired', () => {
      const at = { host: kitchen.host, port: kitchen.port };
      const { browse } = setup({ status: 'listening', target: at }, [kitchen]);

      expect(browse).toHaveBeenCalledWith(true);
      expect((screen.getByRole('button', { name: 'Connect to Kitchen' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('looks again on request, by closing the socket and opening a new one', () => {
      const { browse } = setup({ status: 'idle' }, [kitchen]);
      browse.mockClear();

      fireEvent.click(screen.getByRole('button', { name: 'Look again' }));

      expect(browse.mock.calls).toEqual([[false], [true]]);
    });
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
