import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { flatten, readSystems, toMarkdown } from './perf-summary'

describe('flatten', () => {
  it('names the numbers by their path and leaves out lists and text', () => {
    expect(flatten({ tracks: 'real', scan: { seconds: 8.3, mainLoop: { maxMs: 90, blocks: [{ atMs: 1 }] }, hidden: true } })).toEqual([
      ['scan.seconds', 8.3],
      ['scan.mainLoop.maxMs', 90],
      ['scan.hidden', 1]
    ])
  })
})

describe('toMarkdown', () => {
  it('has a row for each number and a column for each system, empty where a system lacks one', () => {
    const text = toMarkdown({ 'macos-15': { startup: { toPageMs: 7.123 } }, 'ubuntu-latest': { startup: { toPageMs: 650, extra: 1 } } })

    expect(text).toContain('#### startup')
    expect(text).toContain('| | macos-15 | ubuntu-latest |')
    expect(text).toContain('| toPageMs | 7.12 | 650 |')
    expect(text).toContain('| extra |  | 1 |')
  })

  it('says so when there is nothing', () => {
    expect(toMarkdown({})).toContain('No measurements were found')
  })
})

describe('readSystems', () => {
  it('reads the perf files of each artifact folder', () => {
    const folder = mkdtempSync(join(tmpdir(), 'perf-summary-'))
    mkdirSync(join(folder, 'perf-windows-2025'))
    writeFileSync(join(folder, 'perf-windows-2025', 'perf-startup.json'), '{"a":1}')
    writeFileSync(join(folder, 'perf-windows-2025', 'other.json'), '{"b":2}')

    expect(readSystems(folder)).toEqual({ 'windows-2025': { startup: { a: 1 } } })
    rmSync(folder, { recursive: true })
  })
})
