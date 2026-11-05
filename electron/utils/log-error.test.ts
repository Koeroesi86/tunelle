import { describe, expect, it, vi } from 'vitest';
import { logError } from './log-error';

describe('logError', () => {
  it('writes the error to the log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('failed');

    await Promise.reject(error).catch(logError);

    expect(log).toHaveBeenCalledWith(error);
  });
});
