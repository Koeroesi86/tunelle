import { describe, expect, it, vi } from 'vitest';
import { run, wanted } from './automerge-label.js';

const pullRequest = (number: number, { labels = ['automerge'], isDraft = false, isCrossRepository = false, enabledAt }: Record<string, unknown> = {}) => ({
  number,
  id: `id-${number}`,
  isDraft,
  isCrossRepository,
  labels: { nodes: (labels as string[]).map((name) => ({ name })) },
  autoMergeRequest: enabledAt ? { enabledAt } : null,
});

const createFake = (nodes: object[], errors?: object[]) =>
  vi.fn(async (_path: string, options: { body?: string; method?: string }) => {
    const { query = '' } = JSON.parse(options.body ?? '{}');
    return query.includes('enablePullRequestAutoMerge') ? { data: {}, errors } : { data: { repository: { pullRequests: { nodes } } } };
  });

const mutations = (request: ReturnType<typeof createFake>) =>
  request.mock.calls.map(([, options]) => JSON.parse(options.body ?? '{}')).filter(({ query }) => /^mutation/.test(query ?? ''));
const labelRemovals = (request: ReturnType<typeof createFake>) => request.mock.calls.filter(([, options]) => options.method === 'DELETE').map(([path]) => path);

describe('wanted', () => {
  it('takes a labeled pull request that is ready, from this repository and without auto-merge', () => {
    expect(wanted(pullRequest(1))).toBe(true);
  });

  it.each([
    ['has no label', pullRequest(1, { labels: ['bug'] })],
    ['is a draft', pullRequest(1, { isDraft: true })],
    ['is from a fork', pullRequest(1, { isCrossRepository: true })],
    ['has auto-merge on', pullRequest(1, { enabledAt: '2026-11-02T08:00:00Z' })],
  ])('skips a pull request that %s', (_name, item) => {
    expect(wanted(item)).toBe(false);
  });
});

describe('run', () => {
  it('turns squash auto-merge on for the labeled pull requests of the base only, and takes the label off once', async () => {
    const request = createFake([pullRequest(1), pullRequest(2, { labels: [] }), pullRequest(3)]);

    await run(request, 'owner/name', 'master');

    expect(mutations(request).map(({ query, variables }) => [query.includes('SQUASH'), variables.id])).toEqual([
      [true, 'id-1'],
      [true, 'id-3'],
    ]);
    expect(labelRemovals(request)).toEqual(['/repos/owner/name/issues/1/labels/automerge', '/repos/owner/name/issues/3/labels/automerge']);
  });

  it('does nothing when no pull request needs it', async () => {
    const request = createFake([pullRequest(1, { labels: [] })]);

    await run(request, 'owner/name', 'master');

    expect(mutations(request)).toEqual([]);
  });

  it('fails after it tried every pull request when GitHub refuses auto-merge', async () => {
    const request = createFake([pullRequest(1), pullRequest(2)], [{ message: 'not allowed' }]);

    await expect(run(request, 'owner/name', 'master')).rejects.toThrow('2 pull requests could not get auto-merge');
    expect(mutations(request)).toHaveLength(2);
    expect(labelRemovals(request)).toEqual([]);
  });
});
