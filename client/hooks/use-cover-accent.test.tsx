import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCoverAccent } from './use-cover-accent';

const coverAccent = vi.hoisted(() => vi.fn());

vi.mock('../services/cover-accent', () => ({ coverAccent }));

const deferred = () => {
  let resolve: (accent: string | undefined) => void = () => undefined;
  const promise = new Promise<string | undefined>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('useCoverAccent', () => {
  beforeEach(() => coverAccent.mockReset());

  it('gives the accent of the cover once it is read', async () => {
    coverAccent.mockResolvedValue('#112233');
    const { result } = renderHook(() => useCoverAccent('cover-a', true));

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('#112233'));
  });

  it('reads nothing while disabled or without a cover, and drops the accent', async () => {
    coverAccent.mockResolvedValue('#112233');
    const { result, rerender } = renderHook(({ cover, enabled }) => useCoverAccent(cover, enabled), {
      initialProps: { cover: 'cover-a' as string | undefined, enabled: true },
    });
    await waitFor(() => expect(result.current).toBe('#112233'));

    rerender({ cover: 'cover-a', enabled: false });
    expect(result.current).toBeUndefined();

    rerender({ cover: undefined, enabled: true });
    expect(result.current).toBeUndefined();
    expect(coverAccent).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous accent while the next cover is read, and ignores a read that is overtaken', async () => {
    const first = deferred();
    const second = deferred();
    coverAccent.mockImplementation(async (cover: string) => (cover === 'cover-a' ? '#111111' : cover === 'cover-b' ? first.promise : second.promise));
    const { result, rerender } = renderHook(({ cover }) => useCoverAccent(cover, true), { initialProps: { cover: 'cover-a' } });
    await waitFor(() => expect(result.current).toBe('#111111'));

    rerender({ cover: 'cover-b' });
    expect(result.current).toBe('#111111');

    rerender({ cover: 'cover-c' });
    await act(async () => second.resolve('#333333'));
    await act(async () => first.resolve('#222222'));

    expect(result.current).toBe('#333333');
  });
});
