import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequest, isStalled, run, watch } from './retry-unstarted-jobs.js';

const now = Date.parse('2026-11-16T18:00:00Z');
const job = (overrides: object = {}) => ({ status: 'queued', runner_id: null, created_at: '2026-11-16T17:00:00Z', ...overrides });
const finished = job({ status: 'completed', runner_id: 1 });

describe('isStalled', () => {
  it('is stalled when the only unfinished jobs have waited for a runner longer than the limit', () => {
    expect(isStalled([finished, job(), job()], now)).toBe(true);
  });

  it('waits while the job is queued for less than the limit', () => {
    expect(isStalled([finished, job({ created_at: '2026-11-16T17:50:00Z' })], now)).toBe(false);
  });

  it('leaves a run alone while another job runs, as cancelling would stop it', () => {
    expect(isStalled([job(), job({ status: 'in_progress', runner_id: 2 })], now)).toBe(false);
  });

  it('leaves a job that waits for an approval alone', () => {
    expect(isStalled([job({ status: 'waiting' })], now)).toBe(false);
  });

  it('is not stalled when every job has ended', () => {
    expect(isStalled([finished], now)).toBe(false);
  });
});

describe('run', () => {
  const stuck = { id: 7, run_attempt: 1 };
  const createFake = ({
    runs = [stuck],
    jobs = [finished, job()],
    statuses = ['completed'],
  }: { runs?: object[]; jobs?: object[]; statuses?: string[] } = {}) => {
    const pending = [...statuses];
    return vi.fn(async (path: string, options?: { method: string }) => {
      if (path.includes('/workflows/pr-checks.yml') && path.includes('status=queued')) return { workflow_runs: runs };
      if (path.includes('/workflows/')) return { workflow_runs: [] };
      if (path.endsWith('/jobs?per_page=100')) return { jobs };
      if (options?.method === 'POST') return undefined;
      return { status: pending.shift() ?? 'completed' };
    });
  };
  const posts = (request: ReturnType<typeof createFake>) => request.mock.calls.filter(([, options]) => options?.method === 'POST').map(([path]) => path);

  it('cancels a run with a job that no runner took, and runs its failed jobs again once it ended', async () => {
    const request = createFake();

    await run(request, 'owner/name', now);

    expect(posts(request)).toEqual(['/repos/owner/name/actions/runs/7/cancel', '/repos/owner/name/actions/runs/7/rerun-failed-jobs']);
  });

  it('waits for the cancelled run to end before it runs the jobs again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const request = createFake({ statuses: ['in_progress', 'completed'] });

    const done = run(request, 'owner/name', now);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    vi.useRealTimers();

    expect(posts(request).at(-1)).toBe('/repos/owner/name/actions/runs/7/rerun-failed-jobs');
  });

  it('cancels by force when the run does not end after the cancel, as a job with always() waits for a runner', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const request = createFake({ statuses: Array(12).fill('in_progress') });

    const done = run(request, 'owner/name', now);
    await vi.advanceTimersByTimeAsync(60000);
    await done;
    vi.useRealTimers();

    expect(posts(request)).toEqual([
      '/repos/owner/name/actions/runs/7/cancel',
      '/repos/owner/name/actions/runs/7/force-cancel',
      '/repos/owner/name/actions/runs/7/rerun-failed-jobs',
    ]);
  });

  it('fails without a rerun when the run does not end after the force-cancel either', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const request = createFake({ statuses: Array(60).fill('in_progress') });

    const done = expect(run(request, 'owner/name', now)).rejects.toThrow(/by force/);
    await vi.advanceTimersByTimeAsync(300000);
    await done;
    vi.useRealTimers();

    expect(posts(request)).not.toContain('/repos/owner/name/actions/runs/7/rerun-failed-jobs');
  });

  it('leaves a run alone that was run again already', async () => {
    const request = createFake({ runs: [{ id: 7, run_attempt: 3 }] });

    await run(request, 'owner/name', now);

    expect(posts(request)).toEqual([]);
  });

  it('leaves a run alone when a runner took the job since it was found', async () => {
    const request = createFake();
    const answers = [{ jobs: [finished, job()] }, { jobs: [finished, job({ status: 'in_progress', runner_id: 4 })] }];
    request.mockImplementation(async (path: string, options?: { method: string }) => {
      if (path.includes('/workflows/pr-checks.yml') && path.includes('status=queued')) return { workflow_runs: [stuck] };
      if (path.includes('/workflows/')) return { workflow_runs: [] };
      if (path.endsWith('/jobs?per_page=100')) return answers.shift() ?? answers[0];
      return options ? undefined : { status: 'completed' };
    });

    await run(request, 'owner/name', now);

    expect(posts(request)).toEqual([]);
  });

  it('leaves a run alone that has more jobs than the page lists, as a running one could be on the next page', async () => {
    const request = createFake();
    request.mockImplementation(async (path: string) => {
      if (path.includes('/workflows/pr-checks.yml') && path.includes('status=queued')) return { workflow_runs: [stuck] };
      if (path.includes('/workflows/')) return { workflow_runs: [] };
      return { jobs: [job()], total_count: 101 };
    });

    await run(request, 'owner/name', now);

    expect(posts(request)).toEqual([]);
  });

  it('leaves a run alone whose jobs have a runner', async () => {
    const request = createFake({ jobs: [job({ status: 'in_progress', runner_id: 3 })] });

    await run(request, 'owner/name', now);

    expect(posts(request)).toEqual([]);
  });
});

describe('watch', () => {
  const stuckJobs = [finished, job()];
  const notAcquired = { id: 9, name: 'dist / Dist (macos arm64)', status: 'completed', conclusion: 'cancelled', runner_id: null };
  const createFake = (runs: object[], jobs: object[] = stuckJobs, annotations: object[] = []) => {
    const answers = [...runs];
    return vi.fn(async (path: string, options?: { method: string }) => {
      if (path.endsWith('/jobs?per_page=100')) return { jobs };
      if (path.endsWith('/annotations')) return annotations;
      if (options?.method === 'POST') return undefined;
      return answers.length > 1 ? answers.shift() : answers[0];
    });
  };
  const posts = (request: ReturnType<typeof createFake>) => request.mock.calls.filter(([, options]) => options?.method === 'POST').map(([path]) => path);
  const watchFor = async (request: ReturnType<typeof createFake>, minutes: number) => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    vi.setSystemTime(now);
    const done = watch(request, 'owner/name', '7');
    await vi.advanceTimersByTimeAsync(minutes * 60 * 1000);
    await done;
    vi.useRealTimers();
  };
  const gaveUp = [{ message: 'The job was not acquired by Runner of type hosted even after multiple attempts' }];

  afterEach(() => vi.useRealTimers());

  it('checks again every few minutes and runs the jobs again once a job has waited too long for a runner', async () => {
    const request = createFake([
      { status: 'in_progress', run_attempt: 1 },
      { status: 'in_progress', run_attempt: 1 },
      { status: 'completed', run_attempt: 2 },
    ]);

    await watchFor(request, 15);

    expect(posts(request)).toEqual(['/repos/owner/name/actions/runs/7/cancel', '/repos/owner/name/actions/runs/7/rerun-failed-jobs']);
  });

  it('stops when the run has ended without a job that GitHub gave up on', async () => {
    const request = createFake([{ status: 'completed', run_attempt: 1 }]);

    await watchFor(request, 5);

    expect(posts(request)).toEqual([]);
  });

  it('stops when the run was run again as often as allowed', async () => {
    const request = createFake([{ status: 'in_progress', run_attempt: 3 }]);

    await watchFor(request, 5);

    expect(posts(request)).toEqual([]);
  });

  it('leaves a run alone while a runner has its job and keeps watching until it ends', async () => {
    const request = createFake(
      [
        { status: 'in_progress', run_attempt: 1 },
        { status: 'completed', run_attempt: 1 },
      ],
      [{ status: 'in_progress', runner_id: 3, created_at: '2026-11-16T17:00:00Z' }]
    );

    await watchFor(request, 10);

    expect(posts(request)).toEqual([]);
  });

  it('runs the jobs again of an ended run whose job GitHub gave up on, and the check that reports it', async () => {
    const jobs = [finished, notAcquired, { id: 10, name: 'required-checks', conclusion: 'failure', runner_id: 5 }];
    const request = createFake(
      [
        { status: 'completed', run_attempt: 1 },
        { status: 'completed', run_attempt: 3 },
      ],
      jobs,
      gaveUp
    );

    await watchFor(request, 5);

    expect(posts(request)).toEqual(['/repos/owner/name/actions/runs/7/rerun-failed-jobs']);
  });

  it('leaves an ended run alone that has a job that ran and failed', async () => {
    const jobs = [notAcquired, { id: 11, name: 'test / Test (windows-2025)', conclusion: 'failure', runner_id: 6 }];
    const request = createFake([{ status: 'completed', run_attempt: 1 }], jobs, gaveUp);

    await watchFor(request, 5);

    expect(posts(request)).toEqual([]);
  });

  it('leaves an ended run alone whose job was cancelled by a person or by the cancel of this script', async () => {
    const request = createFake([{ status: 'completed', run_attempt: 1 }], [notAcquired], [{ message: 'The run was canceled by @someone.' }]);

    await watchFor(request, 5);

    expect(posts(request)).toEqual([]);
  });
});

describe('createRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers nothing for an empty body, as cancel and rerun do', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));

    await expect(createRequest('secret')('/x', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('has no request without a token', async () => {
    await expect(createRequest(undefined)('/x')).rejects.toThrow(/GH_TOKEN is not set/);
  });

  it('throws on a status that is not ok', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 409, text: async () => 'conflict' }));

    await expect(createRequest('secret')('/x', { method: 'POST' })).rejects.toThrow(/POST \/x answered 409: conflict/);
  });
});
