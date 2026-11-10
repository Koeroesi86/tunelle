const { spawnSync } = require('child_process')
const { copyFileSync, mkdirSync, rmSync } = require('fs')
const { join } = require('path')

// usage: node scripts/checks/run-e2e.js [playwright arguments]
// runs the tests tagged @parallel with 3 workers, then the rest one at a time, as those measure the audio against a clock that a second app would load
// in CI each phase writes a blob report and one HTML report in playwright-report holds both
// See docs/development/end-to-end-tests.md

const playwright = join(__dirname, '../../node_modules/playwright/cli.js')
const extra = process.argv.slice(2)
const isCi = Boolean(process.env.CI)

const run = (args, env = {}) => spawnSync(process.execPath, [playwright, ...args], { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1

const phases = [
  { name: 'parallel', args: ['--grep', '@parallel', '--workers', '3'] },
  { name: 'serial', args: ['--grep-invert', '@parallel', '--workers', '1'] },
]

// both phases run even when the first fails, so one run shows every failed test; the traces go to a folder each, as a run empties its output
const codes = phases.map(({ name, args }) => {
  console.log(`\n== end to end tests: ${name}`)
  const reporter = isCi ? ['--reporter', 'github,list,blob'] : []
  const env = { PLAYWRIGHT_BLOB_OUTPUT_DIR: join('blob-report', name), PLAYWRIGHT_BLOB_OUTPUT_NAME: `${name}.zip` }
  return run(['test', '--project', 'e2e', '--pass-with-no-tests', '--output', join('test-results', name), ...reporter, ...args, ...extra], env)
})

/** A blob reporter empties its folder, so each phase has one, and the zips are brought together for the merge */
const merge = () => {
  rmSync(join('blob-report', 'all'), { recursive: true, force: true })
  mkdirSync(join('blob-report', 'all'), { recursive: true })
  phases.forEach(({ name }) => copyFileSync(join('blob-report', name, `${name}.zip`), join('blob-report', 'all', `${name}.zip`)))
  return run(['merge-reports', '--reporter', 'html', join('blob-report', 'all')], { PLAYWRIGHT_HTML_OPEN: 'never' })
}

const merged = isCi ? merge() : 0

process.exit(codes.find(code => code !== 0) ?? merged)
