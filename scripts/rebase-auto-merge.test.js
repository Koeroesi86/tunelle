import { describe, expect, it } from 'vitest'
import { pickNext } from './rebase-auto-merge.js'

const pullRequest = (number, enabledAt, { mergeable = 'MERGEABLE', state } = {}) => ({
  number,
  mergeable,
  autoMergeRequest: enabledAt ? { enabledAt } : null,
  commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] }
})

describe('pickNext', () => {
  it('takes the pull request whose auto-merge was enabled first, not the oldest one', () => {
    const pullRequests = [pullRequest(1, '2026-11-02T10:00:00Z'), pullRequest(2, '2026-11-02T08:00:00Z'), pullRequest(3, '2026-11-02T09:00:00Z')]

    expect(pickNext(pullRequests).number).toBe(2)
  })

  it('ignores pull requests without auto-merge', () => {
    expect(pickNext([pullRequest(1), pullRequest(2, '2026-11-02T08:00:00Z')]).number).toBe(2)
  })

  it('does not wait for a pull request with a failed check or a conflict', () => {
    const pullRequests = [
      pullRequest(1, '2026-11-02T08:00:00Z', { state: 'FAILURE' }),
      pullRequest(2, '2026-11-02T08:30:00Z', { mergeable: 'CONFLICTING' }),
      pullRequest(3, '2026-11-02T09:00:00Z', { state: 'PENDING' })
    ]

    expect(pickNext(pullRequests).number).toBe(3)
  })

  it('has nothing to take without a pull request with auto-merge', () => {
    expect(pickNext([pullRequest(1)])).toBeUndefined()
  })
})
