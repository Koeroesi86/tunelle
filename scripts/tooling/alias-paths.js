const { readdirSync, readFileSync, writeFileSync } = require('fs')
const { dirname, join, posix, relative, sep } = require('path')

// tsc leaves "@shared/x" as it is, and node can not resolve it. See docs/building.md.
const aliasPattern = /(require\(\s*|from\s*)(["'])@shared\/([^"']+)\2/g

const rewrite = (source, file, outDir) =>
  source.replace(aliasPattern, (_, start, quote, target) => {
    const path = relative(dirname(file), join(outDir, 'shared', target)).split(sep).join(posix.sep)
    return `${start}${quote}${path.startsWith('.') ? path : `./${path}`}${quote}`
  })

const listScripts = (folder) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listScripts(join(folder, entry.name)) : entry.name.endsWith('.js') ? [join(folder, entry.name)] : []
  )

const rewriteFolder = (outDir) =>
  listScripts(outDir).forEach((file) => {
    const source = readFileSync(file, 'utf8')
    const rewritten = rewrite(source, file, outDir)
    if (rewritten !== source) writeFileSync(file, rewritten)
  })

module.exports = { rewrite, rewriteFolder }
