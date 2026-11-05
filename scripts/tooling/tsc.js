const { spawnSync } = require('child_process')
const { existsSync, rmSync } = require('fs')
const { basename, join } = require('path')
const cache = require('./config/cache')
const { rewriteFolder } = require('./alias-paths')

// usage: node scripts/tooling/tsc.js <tsconfig> [outDir]
const [project, outDir] = process.argv.slice(2)
const buildInfoFile = join(cache.tsc, `${basename(project, '.json')}.tsbuildinfo`)

// a restored build info with a missing output folder would make tsc skip emitting
if (outDir && !existsSync(outDir)) {
  rmSync(buildInfoFile, { force: true })
}

const { status } = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', project, '--incremental', '--tsBuildInfoFile', buildInfoFile],
  { stdio: 'inherit' }
)

if (status === 0 && outDir) rewriteFolder(outDir)

process.exit(status === null ? 1 : status)
