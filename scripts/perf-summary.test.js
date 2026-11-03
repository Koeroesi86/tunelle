import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { change, flatten, readSystems, toMarkdown } from './perf-summary'

describe('flatten', () => {
  it('names the numbers by their path and leaves out lists and text', () => {
    expect(flatten({ tracks: 'real', scan: { seconds: 8.3, mainLoop: { maxMs: 90, blocks: [{ atMs: 1 }] }, hidden: true } })).toEqual([
      ['scan.seconds', 8.3],
      ['scan.mainLoop.maxMs', 90],
      ['scan.hidden', 1]
    ])
  })
})

describe('change', () => {
  it('is the signed percent from the base, in bold from a fifth', () => {
    expect(change(105, 100)).toBe('+5%')
    expect(change(90, 100)).toBe('-10%')
    expect(change(150, 100)).toBe('**+50%**')
    expect(change(50, 100)).toBe('**-50%**')
  })

  it('says new for a number the base had as 0, and is empty without one of the two', () => {
    expect(change(3, 0)).toBe('new')
    expect(change(0, 0)).toBe('0%')
    expect(change(3, undefined)).toBe('')
    expect(change(undefined, 3)).toBe('')
  })
})

describe('toMarkdown', () => {
  it('has a row for each number and a column for each system, empty where a system lacks one', () => {
    const text = toMarkdown({ 'macos-15': { pr: { startup: { toPageMs: 7.123 } } }, 'ubuntu-latest': { pr: { startup: { toPageMs: 650, extra: 1 } } } })

    expect(text).toContain('#### startup')
    expect(text).toContain('| | macos-15 | ubuntu-latest |')
    expect(text).toContain('| toPageMs | 7.12 | 650 |')
    expect(text).toContain('| extra |  | 1 |')
  })

  it('puts the base and the change next to the number of each system when the base was measured', () => {
    const text = toMarkdown({ 'ubuntu-latest': { base: { startup: { toPageMs: 100, gone: 5 } }, pr: { startup: { toPageMs: 150, added: 2 } } } })

    expect(text).toContain('| | ubuntu-latest base | ubuntu-latest PR | change |')
    expect(text).toContain('| toPageMs | 100 | 150 | **+50%** |')
    expect(text).toContain('| added |  | 2 |  |')
    expect(text).not.toContain('gone')
  })

  it('says so when there is nothing', () => {
    expect(toMarkdown({})).toContain('No measurements were found')
  })
})

describe('readSystems', () => {
  it('reads the perf files of each artifact folder, the base ones apart', () => {
    const folder = mkdtempSync(join(tmpdir(), 'perf-summary-'))
    mkdirSync(join(folder, 'perf-windows-2025'))
    mkdirSync(join(folder, 'base-perf-windows-2025'))
    writeFileSync(join(folder, 'perf-windows-2025', 'perf-startup.json'), '{"a":1}')
    writeFileSync(join(folder, 'perf-windows-2025', 'other.json'), '{"b":2}')
    writeFileSync(join(folder, 'base-perf-windows-2025', 'perf-startup.json'), '{"a":2}')

    expect(readSystems(folder)).toEqual({ 'windows-2025': { pr: { startup: { a: 1 } }, base: { startup: { a: 2 } } } })
    rmSync(folder, { recursive: true })
  })
})
