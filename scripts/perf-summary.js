const { existsSync, readdirSync, readFileSync, statSync } = require('fs')
const { join } = require('path')

// usage: node scripts/perf-summary.js <folder>
// the folder has a subfolder for each system (the artifacts of .github/workflows/perf.yml, named perf-<system>) with the perf-<name>.json files that `npm run perf` writes
// prints a markdown table for each file, a row for each number and a column for each system, so the systems can be compared at a glance; the numbers are measurements, not budgets

const isNumber = value => typeof value === 'number' && Number.isFinite(value)

/** The numbers of an object by their path (`scan.mainLoop.maxMs`); a list (such as the blocks of the main process, with their times) is left out */
const flatten = (value, path = []) =>
  isNumber(value)
    ? [[path.join('.'), value]]
    : typeof value === 'boolean'
      ? [[path.join('.'), value ? 1 : 0]]
      : value && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).flatMap(([key, inner]) => flatten(inner, [...path, key]))
        : []

const round = value => (Math.abs(value) >= 100 ? `${Math.round(value)}` : `${Math.round(value * 100) / 100}`)

/** The tables of the systems: { 'ubuntu-latest': { 'scan-and-scroll': { ...report } } } */
const toMarkdown = bySystem => {
  const systems = Object.keys(bySystem).sort()
  const names = [...new Set(systems.flatMap(system => Object.keys(bySystem[system])))].sort()

  if (names.length === 0) return '### Performance\n\nNo measurements were found.\n'

  return [
    '### Performance',
    'Measurements of the built app on each system (`npm run perf`), not budgets. Times are in ms unless the name says otherwise.',
    ...names.flatMap(name => {
      const rows = systems.map(system => new Map(flatten(bySystem[system][name])))
      const keys = [...new Set(rows.flatMap(row => [...row.keys()]))]
      return [
        `#### ${name}`,
        [`| | ${systems.join(' | ')} |`, `|---|${systems.map(() => '---:').join('|')}|`, ...keys.map(key => `| ${key} | ${rows.map(row => (row.has(key) ? round(row.get(key)) : '')).join(' | ')} |`)].join('\n')
      ]
    })
  ].join('\n\n') + '\n'
}

/** The system of an artifact folder (`perf-macos-15` is `macos-15`) and its reports */
const readSystems = folder =>
  Object.fromEntries(
    readdirSync(folder)
      .filter(entry => statSync(join(folder, entry)).isDirectory())
      .map(entry => [
        entry.replace(/^perf-/, ''),
        Object.fromEntries(
          readdirSync(join(folder, entry))
            .filter(file => /^perf-.+\.json$/.test(file))
            .map(file => [file.replace(/^perf-|\.json$/g, ''), JSON.parse(readFileSync(join(folder, entry, file), 'utf8'))])
        )
      ])
  )

module.exports = { flatten, toMarkdown, readSystems }

if (require.main === module) {
  const folder = process.argv[2]
  if (!folder || !existsSync(folder)) {
    console.error('usage: node scripts/perf-summary.js <folder with a subfolder for each system>')
    process.exit(1)
  }
  process.stdout.write(toMarkdown(readSystems(folder)))
}
