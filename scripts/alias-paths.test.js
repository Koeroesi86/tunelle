import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { rewrite, rewriteFolder } from './alias-paths'

describe('alias paths', () => {
  it('points @shared at the shared folder of the output, relative to the file', () => {
    const source = 'const a = require("@shared/utils/wait");\nconst b = require("./other");'

    expect(rewrite(source, join('out', 'electron', 'services', 'a.js'), 'out')).toBe(
      'const a = require("../../shared/utils/wait");\nconst b = require("./other");'
    )
  })

  it('uses ./ for a file next to the shared folder', () => {
    expect(rewrite('require("@shared/x")', join('out', 'index.js'), 'out')).toBe('require("./shared/x")')
  })

  it('rewrites the files of a folder', () => {
    const out = mkdtempSync(join(tmpdir(), 'alias-'))
    mkdirSync(join(out, 'electron'))
    writeFileSync(join(out, 'electron', 'a.js'), 'require("@shared/utils/wait")')

    rewriteFolder(out)

    expect(readFileSync(join(out, 'electron', 'a.js'), 'utf8')).toBe('require("../shared/utils/wait")')
  })
})
