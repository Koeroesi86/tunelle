import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequest, queue, run } from './rebase-auto-merge.js';

const pullRequest = (number: number, enabledAt?: string, { mergeable = 'MERGEABLE' }: { mergeable?: string } = {}) => ({
  number,
  mergeable,
  autoMergeRequest: enabledAt ? { enabledAt } : null,
});

describe('queue', () => {
  it('orders by when the auto-merge was enabled, not by the number', () => {
    const pullRequests = [pullRequest(1, '2026-11-02T10:00:00Z'), pullRequest(2, '2026-11-02T08:00:00Z'), pullRequest(3, '2026-11-02T09:00:00Z')];

    expect(queue(pullRequests).map((item: { number: number }) => item.number)).toEqual([2, 3, 1]);
  });

  it('ignores pull requests without auto-merge and the ones with a conflict, not the state of their checks', () => {
    const pullRequests = [pullRequest(1), pullRequest(2, '2026-11-02T08:00:00Z', { mergeable: 'CONFLICTING' }), pullRequest(3, '2026-11-02T09:00:00Z')];

    expect(queue(pullRequests).map((item: { number: number }) => item.number)).toEqual([3]);
  });
});

describe('run', () => {
  const waiting = { ...pullRequest(7, '2026-11-02T08:00:00Z'), headRefOid: 'abc' };
  const createFake = ({ nodes = [waiting], behind_by = 0, errors }: { nodes?: object[]; behind_by?: number; errors?: object[] } = {}) =>
    vi.fn(async (path: string) => (path === '/graphql' ? { data: { repository: { pullRequests: { nodes } } }, errors } : { behind_by }));

  it('rebases the pull request that is behind, on the head it saw', async () => {
    const request = createFake({ behind_by: 3 });

    await run(request, 'owner/name', 'master');

    expect(request).toHaveBeenLastCalledWith('/repos/owner/name/pulls/7/update-branch', {
      method: 'PUT',
      body: JSON.stringify({ expected_head_sha: 'abc', update_method: 'rebase' }),
    });
  });

  it('leaves a pull request that is up to date and takes the next one that is behind', async () => {
    const second = { ...pullRequest(8, '2026-11-02T09:00:00Z'), headRefOid: 'def' };
    const request = vi.fn(async (path: string) =>
      path === '/graphql' ? { data: { repository: { pullRequests: { nodes: [waiting, second] } } } } : { behind_by: path.endsWith('abc') ? 0 : 2 }
    );

    await run(request, 'owner/name', 'master');

    expect(request).toHaveBeenLastCalledWith('/repos/owner/name/pulls/8/update-branch', expect.anything());
  });

  it('does nothing when every pull request is up to date', async () => {
    const request = createFake();

    await run(request, 'owner/name', 'master');

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a pull request with auto-merge', async () => {
    const request = createFake({ nodes: [pullRequest(1)] });

    await run(request, 'owner/name', 'master');

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('fails on an error of the query', async () => {
    await expect(run(createFake({ errors: [{ message: 'denied' }] }), 'owner/name', 'master')).rejects.toThrow(/GraphQL/);
  });
});

describe('createRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the token and answers the body', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => ({ ok: true, json: async () => ({ behind_by: 1 }) }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createRequest('secret')('/repos/a/b')).resolves.toEqual({ behind_by: 1 });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
  });

  it('has no request without a token', async () => {
    await expect(createRequest(undefined)('/x')).rejects.toThrow(/GH_TOKEN is not set/);
  });

  it('names a GET that is not ok', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, text: async () => 'missing' }));

    await expect(createRequest('secret')('/x')).rejects.toThrow(/GET \/x answered 404/);
  });

  it('throws on a status that is not ok', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 403, text: async () => 'forbidden' }));

    await expect(createRequest('secret')('/x', { method: 'PUT' })).rejects.toThrow(/PUT \/x answered 403: forbidden/);
  });
});
