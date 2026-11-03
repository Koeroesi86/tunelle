import { describe, expect, it } from 'vitest'
import { assertPublished, assertSubmittable, readStatus, readStoreVersion, releaseVersion } from './store-submission'

const submission = (...versions) => `Retrieving Submission\n${JSON.stringify({ id: '1', applicationPackages: versions.map((version) => ({ version })) }, undefined, 2)}\n`

describe('releaseVersion', () => {
  it('keeps the first three parts', () => {
    expect(releaseVersion('26.10.14.0')).toBe('26.10.14')
    expect(releaseVersion('26.10.14')).toBe('26.10.14')
  })
})

describe('readStatus', () => {
  it('reads the status after the progress display', () => {
    expect(readStatus('Retrieving submission status\nSubmission Status = Certification\n')).toBe('Certification')
  })

  it('reads it through the colours msstore adds', () => {
    expect(readStatus('Retrieving Last Published Submission\nSubmission Status = \u001b[38;5;2mPublished\u001b[0m\n')).toBe('Published')
  })

  it('has none in other output', () => {
    expect(readStatus('Error!')).toBeUndefined()
  })
})

describe('assertPublished', () => {
  it('accepts a published submission', () => {
    expect(() => assertPublished('Submission Status = Published')).not.toThrow()
  })

  it.each(['Certification', 'PendingCommit', 'CertificationFailed', 'Publishing'])('stops while the last submission is %s', (status) => {
    expect(() => assertPublished(`Submission Status = ${status}`)).toThrow(status)
  })

  it('stops when the status is not known, instead of submitting', () => {
    expect(() => assertPublished('Error!')).toThrow('not known')
  })
})

describe('readStoreVersion', () => {
  it('takes the greatest version of the packages, without the fourth part', () => {
    expect(readStoreVersion(submission('26.10.9.0', '26.10.14.0', '26.10.14.0'))).toBe('26.10.14')
  })

  it('reads the JSON through colours around it', () => {
    expect(readStoreVersion(`\u001b[38;5;2mLast Published Submission\u001b[0m\n${submission('26.11.18.0')}`)).toBe('26.11.18')
  })

  it('orders the versions as numbers', () => {
    expect(readStoreVersion(submission('26.10.9.0', '26.10.14.0'))).toBe('26.10.14')
  })

  it('fails without a package, instead of letting any version through', () => {
    expect(() => readStoreVersion(submission())).toThrow('not known')
  })

  it('fails on output without JSON', () => {
    expect(() => readStoreVersion('Error!')).toThrow()
  })
})

describe('assertSubmittable', () => {
  const packages = ['26.10.15.0', '26.10.15.0']

  it('accepts a greater version with the fourth part 0', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', packages)).not.toThrow()
  })

  it.each(['26.10.15', '26.10.14'])('refuses a version that is not greater than %s', (storeVersion) => {
    expect(() => assertSubmittable('v26.10.14', storeVersion, ['26.10.14.0'])).toThrow('not greater')
  })

  it('refuses a fourth part that is not 0', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', ['26.10.15.0', '26.10.15.1'])).toThrow('26.10.15.1')
  })

  it('refuses a package of another version than the tag', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', ['26.10.14.0'])).toThrow('26.10.14.0')
  })

  it.each(['26.10.15', 'v26.10', 'v26.010.15', 'v26.10.15-beta'])('refuses %s as a tag', (tag) => {
    expect(() => assertSubmittable(tag, '26.10.14', packages)).toThrow('release tag')
  })

  it('refuses without a package version', () => {
    expect(() => assertSubmittable('v26.10.15', '26.10.14', [])).toThrow('No package version')
  })
})
