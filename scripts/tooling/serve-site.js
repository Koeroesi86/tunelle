const { createServer } = require('http')
const { readFile } = require('fs/promises')
const { extname, join, normalize, resolve, sep } = require('path')
const { stampSite } = require('./build-site')
const { renderPages } = require('./site-pages')

// usage: node scripts/tooling/serve-site.js [port]    (npm run site) serves site/ on http://localhost:4173 with the latest release written into the page
// the files are read on every request, so an edit shows after a reload; without a connection to GitHub the page links the latest release page
const root = resolve(__dirname, '../..', 'site')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

const fetchRelease = async () => {
  const response = await fetch('https://api.github.com/repos/Koeroesi86/tunelle/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  return response.json()
}

const createSiteServer = (release) =>
  createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    const path = normalize(join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname))
    // the pages are rendered from their templates, every other file is read as it is; nothing outside of site/
    const page = renderPages().find(([pagePath]) => join(root, pagePath) === path)
    const content = page ? Buffer.from(page[1]) : path.startsWith(root + sep) ? await readFile(path).catch(() => undefined) : undefined
    if (!content) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
      return
    }
    response
      .writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      .end(extname(path) === '.html' ? stampSite(content.toString('utf8'), release) : content)
  })

const start = async (port) => {
  const release = await fetchRelease().catch((error) => {
    console.warn(`Latest release not available (${error.message}): the downloads link the release page`)
    return {}
  })
  createSiteServer(release).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`))
}

if (require.main === module) start(Number(process.argv[2]) || 4173)

module.exports = { createSiteServer }
