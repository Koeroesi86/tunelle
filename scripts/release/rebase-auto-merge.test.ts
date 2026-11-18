import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createRequest, findOldBase, queue, run } from './rebase-auto-merge.js';

const pullRequest = (number: number, enabledAt?: string, { mergeable = 'MERGEABLE' }: { mergeable?: string } = {}) => ({
  number,
  mergeable,
  autoMergeRequest: enabledAt ? { enabledAt } : null,
});

const childProcess: typeof import('child_process') = createRequire(__filename)('child_process');

describe('queue', () => {
  it('orders by when the auto-merge was enabled, not by the number', () => {
    const pullRequests = [pullRequest(1, '2026-11-02T10:00:00Z'), pullRequest(2, '2026-11-02T08:00:00Z'), pullRequest(3, '2026-11-02T09:00:00Z')];

    expect(queue(pullRequests).map((item: { number: number }) => item.number)).toEqual([2, 3, 1]);
  });

  it('ignores pull requests without auto-merge, and keeps the ones with a conflict', () => {
    const pullRequests = [pullRequest(1), pullRequest(2, '2026-11-02T08:00:00Z', { mergeable: 'CONFLICTING' }), pullRequest(3, '2026-11-02T09:00:00Z')];

    expect(queue(pullRequests).map((item: { number: number }) => item.number)).toEqual([2, 3]);
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

  const second = { ...pullRequest(8, '2026-11-02T09:00:00Z'), headRefOid: 'def' };
  const createPair = (first: object) =>
    vi.fn(async (path: string) =>
      path === '/graphql' ? { data: { repository: { pullRequests: { nodes: [second, first] } } } } : { behind_by: path.endsWith('def') ? 2 : 0 }
    );

  it('waits for the first pull request while it is up to date, and leaves the next one behind', async () => {
    const request = createPair(waiting);

    await run(request, 'owner/name', 'master');

    expect(request).not.toHaveBeenCalledWith(expect.stringContaining('update-branch'), expect.anything());
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('waits for the first pull request while it has a conflict, and leaves the next one behind', async () => {
    const request = createPair({ ...waiting, mergeable: 'CONFLICTING', isCrossRepository: true });

    await run(request, 'owner/name', 'master');

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the first pull request is up to date', async () => {
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

describe('squash merged base', () => {
  const stacked = {
    ...pullRequest(9, '2026-11-02T08:00:00Z', { mergeable: 'CONFLICTING' }),
    headRefOid: 'tip',
    headRefName: 'child',
    isCrossRepository: false,
  };
  const commitOf = (sha: string, date = sha) => ({ sha, commit: { author: { date }, message: `message of ${sha}` } });
  const commits = ['p1', 'p2', 'c1'].map((sha) => commitOf(sha));
  const closed = [{ number: 5, merged_at: '2026-11-02T07:00:00Z' }];
  const createStack = (node: object = stacked) =>
    vi.fn(async (path: string) => {
      if (path === '/graphql') return { data: { repository: { pullRequests: { nodes: [node] } } } };
      if (path.includes('/pulls?state=closed')) return [];
      if (path.includes('/pulls/9/commits')) return commits;
      return path.endsWith('/c1/pulls') ? [{ number: 9, merged_at: null }] : closed;
    });
  const gitCalls = () => execFile.mock.calls.map(([, args]) => (Array.isArray(args) ? args.join(' ') : ''));

  let execFile: MockInstance<typeof childProcess.execFile>;
  const fakeGit = (failOn?: string) => (_command: string, args: string[], _options: object, done: (error: Error | undefined) => void) => {
    done(args[1] === failOn ? new Error('conflict') : undefined);
    return undefined;
  };

  beforeEach(() => {
    execFile = vi.spyOn(childProcess, 'execFile').mockImplementation(fakeGit() as never);
  });

  it('finds the last commit of the merged pull request', async () => {
    await expect(findOldBase(createStack(), 'owner/name', 'master', 9)).resolves.toBe('p2');
  });

  it('matches the commits of a merged pull request that was rebased before the merge by the author date and the message', async () => {
    const rebased = commits.slice(0, 2).map((item) => ({ ...item, sha: `rebased-${item.sha}` }));
    const request = vi.fn(async (path: string) => {
      if (path.includes('/pulls?state=closed')) return closed;
      if (path.includes('/pulls/5/commits')) return rebased;
      if (path.includes('/pulls/9/commits')) return commits;
      return [{ number: 9, merged_at: null }];
    });

    await expect(findOldBase(request, 'owner/name', 'master', 9)).resolves.toBe('p2');
  });

  it('has no old base when no commit belongs to a merged pull request', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes('/pulls?state=closed')) return [];
      return path.includes('/commits?') ? commits : [{ number: 9, merged_at: null }];
    });

    await expect(findOldBase(request, 'owner/name', 'master', 9)).resolves.toBeUndefined();
  });

  it('replays the own commits onto master and pushes with a lease on the head it saw', async () => {
    await run(createStack(), 'owner/name', 'master');

    expect(gitCalls()).toEqual([
      'fetch origin master child',
      'switch --detach tip',
      'rebase --onto origin/master p2',
      'push --force-with-lease=refs/heads/child:tip origin HEAD:refs/heads/child',
    ]);
  });

  it('aborts and pushes nothing when the own commits conflict', async () => {
    execFile.mockImplementation(fakeGit('--onto') as never);

    await run(createStack(), 'owner/name', 'master');

    expect(gitCalls()).toEqual(['fetch origin master child', 'switch --detach tip', 'rebase --onto origin/master p2', 'rebase --abort']);
  });

  it('does not touch git for a conflict without a merged pull request below', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/graphql') return { data: { repository: { pullRequests: { nodes: [stacked] } } } };
      if (path.includes('/pulls?state=closed')) return [];
      return path.includes('/commits?') ? commits : [{ number: 9, merged_at: null }];
    });

    await run(request, 'owner/name', 'master');

    expect(execFile).not.toHaveBeenCalled();
  });

  it('does not push to a fork', async () => {
    await run(createStack({ ...stacked, isCrossRepository: true }), 'owner/name', 'master');

    expect(execFile).not.toHaveBeenCalled();
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
