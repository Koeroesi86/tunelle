import { describe, expect, it, vi } from 'vitest';
import { waitForPage } from './wait-for-page';

describe('waitForPage', () => {
  it('asks again until the page is rendered, also when the window fails to answer in between', async () => {
    const evaluate = vi.fn().mockRejectedValueOnce(new Error('Cannot find context')).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await waitForPage(evaluate, Date.now() + 5000, 1);

    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it('fails with the last thing the window said when the page does not render in time', async () => {
    const evaluate = vi.fn().mockRejectedValue(new Error('Execution context was destroyed'));

    await expect(waitForPage(evaluate, Date.now() + 30, 5)).rejects.toThrow('the window said: Execution context was destroyed');
  });
});
