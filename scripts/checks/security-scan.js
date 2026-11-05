const { spawnSync } = require('child_process')
const { mkdtempSync, readFileSync, writeFileSync } = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')

// usage: node scripts/checks/security-scan.js [--update]
// runs Electronegativity on the main process sources and fails on a finding that is not in the baseline,
// so the known misconfigurations are tracked and a new one cannot be added unnoticed
const baselineFile = resolve(__dirname, '../../electronegativity-baseline.json')
const { version } = require('electron/package.json')
const output = join(mkdtempSync(join(tmpdir(), 'electronegativity-')), 'results.sarif')

// the check for the security fixes of the Electron version reads the list of releases from GitHub, and the run ends with an error when that request fails: a failed run is tried again
const attempts = 3
const run = () =>
  spawnSync(process.execPath, [require.resolve('@doyensec/electronegativity/dist/index.js'), '-i', 'electron', '-e', version, '-r', '-o', output], {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  })

const failures = []
while (failures.length < attempts) {
  const { status, signal, error, stderr } = run()
  if (status === 0) break
  // a run that failed says why (a signal ends the process without a status), or the next failure is as unexplained as this one
  failures.push(`status ${status}, signal ${signal} ${error ?? ''}\n${stderr}`)
}
if (failures.length === attempts) {
  console.error(`Electronegativity failed to run ${attempts} times\n${failures.join('\n')}`)
  process.exit(1)
}

const [{ results }] = JSON.parse(readFileSync(output, 'utf8')).runs
const findings = [...new Set(results.map(({ ruleId, locations }) => `${ruleId} ${locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? 'global'}`))].sort()

if (process.argv.includes('--update')) {
  writeFileSync(baselineFile, `${JSON.stringify(findings, null, 2)}\n`)
  console.log(`Baseline updated with ${findings.length} findings`)
  process.exit(0)
}

const accepted = JSON.parse(readFileSync(baselineFile, 'utf8'))
const added = findings.filter(finding => !accepted.includes(finding))
const fixed = accepted.filter(finding => !findings.includes(finding))

fixed.forEach(finding => console.log(`Fixed, remove from the baseline: ${finding}`))
added.forEach(finding => console.error(`New finding: ${finding}`))
console.log(`${findings.length} findings, ${added.length} new`)
process.exit(added.length || fixed.length ? 1 : 0)
