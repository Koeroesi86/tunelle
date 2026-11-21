import { expect, test } from '../support/app';

// the runners have no GPU, so the other tests run in the software mode as the app finds it; these two force each mode. See docs/app/software-rendering.md
test('stops the motion of a window that is drawn in software', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_GPU: '0' } });

  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '');
});

test('keeps the motion of a window that is drawn by a GPU', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_GPU: '1' } });

  await expect(page.locator('#root')).not.toBeEmpty();
  // the message of the main process comes with APP_READY, which the page has sent when its library is there
  await expect(page.locator('html')).not.toHaveAttribute('data-reduce-motion');
});
