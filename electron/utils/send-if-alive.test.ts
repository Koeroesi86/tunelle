import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { sendIfAlive } from './send-if-alive';

const sender = (destroyed: boolean) => ({ isDestroyed: () => destroyed, send: vi.fn() });

describe('sendIfAlive', () => {
  it('sends to a window that is open', () => {
    const open = sender(false);

    sendIfAlive(open as unknown as WebContents, 'CHANNEL', { a: 1 });

    expect(open.send).toHaveBeenCalledWith('CHANNEL', { a: 1 });
  });

  it('sends nothing to a window that was closed', () => {
    const closed = sender(true);

    sendIfAlive(closed as unknown as WebContents, 'CHANNEL', {});

    expect(closed.send).not.toHaveBeenCalled();
  });
});
