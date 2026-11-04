const { existsSync, readdirSync, readFileSync, statSync } = require('fs')
const { join } = require('path')

// usage: node scripts/perf-summary.js <folder>
// the folder has a subfolder for each system (the artifacts of .github/workflows/perf.yml): perf-<system> with the perf-<name>.json files that `npm run perf` writes for the pull request,
// and base-perf-<system> with the same for the base branch, which are run first on the same runner
// the runs of PERF_REPEAT (perf-<name>.json, perf-<name>.1.json, ...) count as their median
// prints a markdown table for each file, a row for each number and a column for each system, with the base and the change in percent next to it when the base was measured; the numbers are measurements, not budgets

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

// a change of a fifth or more is in bold, as the runs of a runner differ by a few percent on their own
const significant = 20

/** The change from the base in percent: signed, and `new` for a number that the base did not have or had as 0 */
const change = (value, base) => {
  if (value === undefined || base === undefined) return ''
  if (base === 0) return value === 0 ? '0%' : 'new'
  const percent = Math.round(((value - base) / Math.abs(base)) * 100)
  const text = `${percent > 0 ? '+' : ''}${percent}%`
  return Math.abs(percent) >= significant ? `**${text}**` : text
}

/** The tables of the systems: { 'ubuntu-latest': { pr: { startup: { ...report } }, base: { startup: { ...report } } } }, `base` is missing when it was not measured */
const toMarkdown = bySystem => {
  const systems = Object.keys(bySystem).sort()
  const names = [...new Set(systems.flatMap(system => Object.keys(bySystem[system].pr ?? {})))].sort()
  const compared = systems.some(system => Object.keys(bySystem[system].base ?? {}).length > 0)

  if (names.length === 0) return '### Performance\n\nNo measurements were found.\n'

  const columns = system => (compared ? [`${system} base`, `${system} PR`, 'change'] : [system])
  const cells = (system, name, key) => {
    const value = new Map(flatten(bySystem[system].pr?.[name])).get(key)
    const base = new Map(flatten(bySystem[system].base?.[name])).get(key)
    const shown = value === undefined ? '' : round(value)
    return compared ? [base === undefined ? '' : round(base), shown, change(value, base)] : [shown]
  }

  return (
    [
      '### Performance',
      compared
        ? 'Measurements of the built app on each system (`npm run perf`), the base branch and the pull request on the same runner, the base first. They are not budgets, and the runs of a runner differ by a few percent on their own: a change of a fifth or more is in bold. A measurement that was run more than once (PERF_REPEAT) shows the median of its runs. Times are in ms unless the name says otherwise.'
        : 'Measurements of the built app on each system (`npm run perf`), not budgets. Times are in ms unless the name says otherwise.',
      ...names.flatMap(name => {
        const keys = [...new Set(systems.flatMap(system => [...flatten(bySystem[system].pr?.[name])].map(([key]) => key)))]
        const header = systems.flatMap(columns)
        return [
          `#### ${name}`,
          [
            `| | ${header.join(' | ')} |`,
            `|---|${header.map(() => '---:').join('|')}|`,
            ...keys.map(key => `| ${key} | ${systems.flatMap(system => cells(system, name, key)).join(' | ')} |`)
          ].join('\n')
        ]
      })
    ].join('\n\n') + '\n'
  )
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The runs of a measurement (PERF_REPEAT) as one report of the numbers by their path, each the median of the runs */
const medianReport = runs =>
  runs.length === 1
    ? runs[0]
    : Object.fromEntries(
        [...new Set(runs.flatMap(run => flatten(run).map(([key]) => key)))].map(key => [key, median(runs.map(run => new Map(flatten(run)).get(key)).filter(value => value !== undefined))])
      )

// perf-<name>.json is the first run, perf-<name>.<n>.json the later ones
const readReports = folder => {
  const runs = readdirSync(folder)
    .map(file => file.match(/^perf-(.+?)(?:\.\d+)?\.json$/))
    .filter(Boolean)
    .reduce((byName, [file, name]) => ({ ...byName, [name]: [...(byName[name] ?? []), JSON.parse(readFileSync(join(folder, file), 'utf8'))] }), {})
  return Object.fromEntries(Object.entries(runs).map(([name, reports]) => [name, medianReport(reports)]))
}

/** The system and the side of an artifact folder (`perf-macos-15` is the pull request on `macos-15`, `base-perf-macos-15` the base) and its reports */
const readSystems = folder =>
  readdirSync(folder)
    .filter(entry => statSync(join(folder, entry)).isDirectory())
    .reduce((systems, entry) => {
      const side = entry.startsWith('base-perf-') ? 'base' : 'pr'
      const system = entry.replace(/^(base-)?perf-/, '')
      return { ...systems, [system]: { ...systems[system], [side]: readReports(join(folder, entry)) } }
    }, {})

module.exports = { flatten, change, median, toMarkdown, readSystems }

if (require.main === module) {
  const folder = process.argv[2]
  if (!folder || !existsSync(folder)) {
    console.error('usage: node scripts/perf-summary.js <folder with a subfolder for each system>')
    process.exit(1)
  }
  process.stdout.write(toMarkdown(readSystems(folder)))
}
