import { describe, expect, it } from 'vitest'
import { describeTests, problemsOf, summarise } from './wack-report'

const report = (overall, tests) =>
  `<?xml version="1.0" encoding="UTF-16"?>\n<REPORT OVERALL_RESULT="${overall}" VERSION="10.0">\n<REQUIREMENTS><REQUIREMENT NUMBER="1" TITLE="Deployment">\n${tests
    .map(
      ([name, result, ...messages]) =>
        `<TEST INDEX="1" NAME="${name.replace('(optional) ', '')}" DESCRIPTION="d" OPTIONAL="${name.startsWith('(optional)') ? 'TRUE' : 'FALSE'}"><RESULT><![CDATA[${result}]]></RESULT>${
          messages.length ? `<MESSAGES>${messages.map(text => `<MESSAGE TEXT="${text}" />`).join('')}</MESSAGES>` : ''
        }</TEST>`
    )
    .join('\n')}\n</REQUIREMENT></REQUIREMENTS></REPORT>`

// the kit writes UTF-16 with a byte order mark
const utf16 = text => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])

describe('summarise', () => {
  it('reads a report in UTF-16 and in UTF-8', () => {
    const text = report('PASS', [['Package sanity', 'PASS']])

    expect(summarise(utf16(text)).overall).toBe('PASS')
    expect(summarise(Buffer.from(text)).tests).toEqual([{ name: 'Package sanity', optional: false, result: 'PASS', messages: [] }])
  })

  it('lists the failures and the warnings with their messages', () => {
    const summary = summarise(
      utf16(report('FAIL', [['Binary analyzer', 'FAIL', 'ASLR is off'], ['Supported APIs', 'WARNING', 'Uses an API'], ['App manifest', 'PASS']]))
    )

    expect(summary.failures).toEqual([{ name: 'Binary analyzer', optional: false, result: 'FAIL', messages: ['ASLR is off'] }])
    expect(summary.warnings.map(({ name }) => name)).toEqual(['Supported APIs'])
    expect(describeTests('Failures:', summary.failures)).toEqual(['Failures:', '  Binary analyzer', '    ASLR is off'])
  })
})

describe('describeTests', () => {
  it('writes nothing for no tests', () => {
    expect(describeTests('Failures:', [])).toEqual([])
  })
})

describe('problemsOf', () => {
  it('names a missing overall result', () => {
    const summary = summarise(Buffer.from('<REPORT><TEST NAME="App manifest"><RESULT>PASS</RESULT></TEST></REPORT>'))

    expect(summary.overall).toBe('')
    expect(problemsOf(summary)).toEqual(['The overall result is missing'])
  })

  it('reads a result without CDATA, and none as an empty result', () => {
    expect(summarise(Buffer.from('<TEST NAME="a"><RESULT>FAIL</RESULT></TEST><TEST NAME="b"></TEST>')).tests.map(({ result }) => result)).toEqual(['FAIL', ''])
  })

  it('does not fail on an optional test that failed, as the overall result of the kit is a pass', () => {
    const summary = summarise(utf16(report('PASS', [['(optional) Blocked executables', 'FAIL', 'CreateProcessW'], ['App manifest', 'PASS']])))

    expect(summary.optionalFailures.map(({ name }) => name)).toEqual(['Blocked executables'])
    expect(problemsOf(summary)).toEqual([])
  })

  it('has none for a report that passed, also with warnings', () => {
    expect(problemsOf(summarise(utf16(report('PASS', [['App manifest', 'PASS'], ['Supported APIs', 'WARNING']]))))).toEqual([])
  })

  it('names every failed test', () => {
    expect(problemsOf(summarise(utf16(report('FAIL', [['Binary analyzer', 'FAIL'], ['App manifest', 'FAIL']]))))).toEqual([
      'Failed: Binary analyzer',
      'Failed: App manifest'
    ])
  })

  it('fails on an overall result that is not a pass without a failed test', () => {
    expect(problemsOf(summarise(utf16(report('FAIL', [['App manifest', 'PASS']]))))).toEqual(['The overall result is FAIL'])
  })

  it('fails on a report without tests, as the kit did not run', () => {
    expect(problemsOf(summarise(Buffer.from('')))).toEqual(['The report has no tests: the kit did not run'])
  })
})
