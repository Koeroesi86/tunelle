const { spawn, spawnSync } = require('child_process')
const { createServer } = require('net')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('fs')
const { createServer: createHttpServer } = require('http')
const { tmpdir } = require('os')
const { join, resolve } = require('path')
const { packagedExecutable, resourcesFolder } = require('./dist-layout')
const { waitForPage } = require('./wait-for-page')

// usage: node scripts/smoke.js [--packaged | --flatpak]
// starts the built app (out/index.js), the packaged one from dist/, or the installed flatpak (flatpak install dist/Tunelle-*.flatpak), and checks that the window opens
// and that the tunelle protocol answers from the database, plays a track of the library with seeking and a station with its title: a missing file or a native module that does not load shows up here
// the updater is turned off (TUNELLE_NO_UPDATE), so a newer release can not be downloaded and installed in the middle of the run
const root = resolve(__dirname, '..')
const timeout = 60000

// what comes from the app or its files is printed on one line per entry, so it cannot forge a line of the log of the run
const printable = text => String(text).replace(/[\r\n]+/g, ' ')

const flatpak = process.argv.includes('--flatpak')
const packaged = flatpak || process.argv.includes('--packaged')
const executablePath = flatpak ? 'flatpak' : packaged ? resolve(root, packagedExecutable(process.platform, process.arch)) : require('electron')
// the flatpak starts its own sandbox: zypak sets the chromium sandbox up, so --no-sandbox is not passed
// elsewhere the sandbox of chromium needs user namespaces that the CI runners (containers, locked down images) do not give on Linux; macOS and Windows run it
const args = flatpak
  ? ['run', '--env=TUNELLE_NO_UPDATE=1', require('../package.json').build.appId]
  : [...(packaged ? [] : [resolve(root, 'out/index.js')]), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]

if (!flatpak && !existsSync(executablePath)) {
  console.error(`${executablePath} does not exist, build first`)
  process.exit(1)
}

// a clean user data folder, so the run does not touch the library of the machine
const home = mkdtempSync(join(tmpdir(), 'tunelle-smoke-'))
const logFile = join(home, 'chromium.log')
const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env
// windows keeps its profile folders (chromium needs them to start, and the app data folder does not follow the variables there), the other systems get the clean ones
// the flatpak finds its user installation through HOME and keeps the data of the app in its own folder, so it keeps them too
const env =
  process.platform === 'win32' || flatpak
    ? { ...inherited, NODE_ENV: 'production', TUNELLE_NO_UPDATE: '1', TUNELLE_NO_ARTIST_PHOTOS: '1' }
    : { ...inherited, HOME: home, XDG_CONFIG_HOME: home, NODE_ENV: 'production', TUNELLE_NO_UPDATE: '1', TUNELLE_NO_ARTIST_PHOTOS: '1' }

const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer().once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })

// the window may open after the app started, so the debugging endpoint of the chromium is polled
const findWindowUrl = async (port, child) => {
  const deadline = Date.now() + timeout
  let open = 'none'
  let endpointError = 'none'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The app exited with ${child.exitCode} before a window opened`)
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then(
      response => response.json(),
      error => {
        endpointError = String(error.cause?.code ?? error)
        return []
      }
    )
    const target = targets.find(candidate => candidate.url === 'tunelle://app/index.html')
    if (target) return target
    open = targets.map(candidate => candidate.url).join(', ') || open
    await new Promise(done => setTimeout(done, 500))
  }
  throw new Error(`No main window, open: ${open}, debugging endpoint error: ${endpointError}`)
}

// a mono 8 bit wav of one second per 8000 bytes, the smallest file the library scan takes for a track
const writeWav = (file, seconds) => {
  const data = Buffer.alloc(8000 * seconds, 128)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(8000, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  writeFileSync(file, Buffer.concat([header, data]))
}

// the byte of a stream of silent mpeg frames (128 kbit/s, 44.1 kHz, 417 bytes of a header and zeros) at a position
const frameLength = 417
const silentByte = position => [0xff, 0xfb, 0x90, 0x00][position % frameLength] ?? 0

// a station directory with one station that never ends: silent mp3 frames, a second of them before every ICY metadata block, the first seconds at once so playback starts promptly
const startStation = () => {
  const audioPerBlock = 16000
  const connections = { open: 0, total: 0 }
  const text = Buffer.from("StreamTitle='Smoke - Song';")
  const metadata = Buffer.concat([Buffer.from([Math.ceil(text.length / 16)]), text, Buffer.alloc(Math.ceil(text.length / 16) * 16 - text.length)])
  let origin = ''

  const server = createHttpServer((request, response) => {
    // the directory resolves every station to this one
    if (request.url.startsWith('/json/url/')) return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ url: `${origin}/station` }))
    // the rest of the directory has nothing to list
    if (request.url.startsWith('/json/')) return response.writeHead(200, { 'content-type': 'application/json' }).end('[]')
    if (request.url !== '/station') return response.writeHead(404).end()

    connections.open += 1
    connections.total += 1
    const asksForMetadata = request.headers['icy-metadata'] === '1'
    response.writeHead(200, asksForMetadata ? { 'content-type': 'audio/mpeg', 'icy-metaint': String(audioPerBlock) } : { 'content-type': 'audio/mpeg' })
    let block = 0
    const send = () => {
      const audio = Buffer.from(Array.from({ length: audioPerBlock }, (_, index) => silentByte(block * audioPerBlock + index)))
      response.write(Buffer.concat([audio, ...(asksForMetadata ? [metadata] : [])]))
      block += 1
    }
    const timer = setInterval(() => (block < 3 ? send() : undefined), 0)
    const pace = setInterval(() => (block >= 3 ? send() : undefined), 1000)
    response.on('close', () => {
      clearInterval(timer)
      clearInterval(pace)
      connections.open -= 1
    })
  })

  return new Promise(done =>
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`
      done({ origin, connections, close: () => server.close() })
    })
  )
}

// runs an expression in the window through the debugging endpoint and answers its value
const evaluateIn = (socketUrl, expression) =>
  new Promise((done, fail) => {
    const socket = new WebSocket(socketUrl)
    // a page that waits for an event that never comes would hold the run until the limit of the job
    const timer = setTimeout(() => {
      socket.close()
      fail(new Error(`The window did not answer in ${timeout} ms`))
    }, timeout)
    socket.onerror = () => fail(new Error('The debugging socket failed'))
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    socket.onmessage = ({ data }) => {
      const { result, error } = JSON.parse(data)
      clearTimeout(timer)
      socket.close()
      if (error || result.exceptionDetails) return fail(new Error(JSON.stringify(error ?? result.exceptionDetails)))
      done(result.result.value)
    }
  })

// in the page: waits for an event of an audio element, and says what the element was doing when it did not come
const audioHelpers = `
  const describe = audio => 'readyState ' + audio.readyState + ', networkState ' + audio.networkState + ', error ' + audio.error?.code + ', currentTime ' + audio.currentTime
  const waitFor = (audio, event, source) =>
    new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('no ' + event + ' of ' + source + ' (' + describe(audio) + ')')), 15000)
      audio.addEventListener(event, () => { clearTimeout(timer); done() }, { once: true })
      audio.addEventListener('error', () => { clearTimeout(timer); fail(new Error('audio error of ' + source + ' (' + describe(audio) + ')')) }, { once: true })
    })
`

// a track of the library is served over the protocol: the whole file, a range of it, and a seek of an audio element that needs ranges
const checkTracks = async socketUrl => {
  const folder = join(home, 'music')
  mkdirSync(folder)
  writeWav(join(folder, 'smoke.wav'), 10)

  // the library keeps the path as the scan made it, which is not always the spelling of the one that was added (short names, separators, the case of a drive)
  const deadline = Date.now() + timeout
  let tracks = []
  let stored
  while (!stored && Date.now() < deadline) {
    await evaluateIn(socketUrl, `window.electronAPI.send('ADD_FOLDERS_TO_LIBRARY', [{ path: ${JSON.stringify(folder)}, lastModified: 0 }])`)
    tracks = await evaluateIn(socketUrl, `fetch('tunelle://app/library').then(response => response.json())`)
    stored = tracks.find(track => /(^|[\\/])smoke\.wav$/.test(track.path))
    if (!stored) await new Promise(done => setTimeout(done, 1000))
  }
  if (!stored) throw new Error(`smoke.wav did not get into the library in ${timeout} ms, it has: ${JSON.stringify(tracks.map(track => track.path))}`)

  const result = await evaluateIn(
    socketUrl,
    `(async () => {
      ${audioHelpers}
      const url = 'tunelle://app/track?path=' + encodeURIComponent(${JSON.stringify(stored.path)})
      const whole = await fetch(url)
      const part = await fetch(url, { headers: { range: 'bytes=100-199' } })
      const suffix = await fetch(url, { headers: { range: 'bytes=-50' } })
      const outside = await fetch('tunelle://app/track?path=' + encodeURIComponent(${JSON.stringify(join(home, 'other.wav'))}))
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.src = url
      await waitFor(audio, 'loadedmetadata', url)
      const seeked = waitFor(audio, 'seeked', url)
      audio.currentTime = 6
      await seeked
      return {
        whole: [whole.status, (await whole.arrayBuffer()).byteLength],
        part: [part.status, part.headers.get('content-range'), (await part.arrayBuffer()).byteLength],
        suffix: [suffix.status, suffix.headers.get('content-range'), (await suffix.arrayBuffer()).byteLength],
        outside: outside.status,
        seek: [Math.round(audio.duration), Math.round(audio.currentTime)]
      }
    })()`
  )
  const expected = { whole: [200, 80044], part: [206, 'bytes 100-199/80044', 100], suffix: [206, 'bytes 79994-80043/80044', 50], outside: 404, seek: [10, 6] }
  if (JSON.stringify(result) !== JSON.stringify(expected)) throw new Error(`A track over tunelle answered ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`)
  console.log(`tracks over tunelle passed: ${JSON.stringify(result)}`)
}

// a station is served as it arrives: the audio without the ICY metadata, the title reported, a connection to the station that ends with the player
const checkRadio = async (socketUrl, station) => {
  const result = await evaluateIn(
    socketUrl,
    `(async () => {
      ${audioHelpers}
      const titles = []
      window.electronAPI.on('RADIO_STREAM_TITLE', payload => titles.push(payload.title))
      const response = await fetch('tunelle://app/radio/smoke-station')
      const reader = response.body.getReader()
      const received = []
      let length = 0
      // the stream has no end: that bytes arrive at all means they are not held until it ends
      while (length < 20000) {
        const { done, value } = await reader.read()
        if (done) throw new Error('the stream ended after ' + length + ' bytes')
        received.push(value)
        length += value.length
      }
      await reader.cancel()
      const bytes = new Uint8Array(length)
      received.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length), 0)
      const frameLength = ${frameLength}
      const silentByte = ${silentByte.toString()}
      const metadataLeft = bytes.filter((byte, position) => byte !== silentByte(position)).length
      for (let waited = 0; titles.length === 0 && waited < 10000; waited += 100) await new Promise(done => setTimeout(done, 100))

      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.src = 'tunelle://app/radio/smoke-station'
      audio.play().catch(() => undefined)
      const played = await new Promise(done => {
        const check = () => (audio.currentTime > 0.5 ? done('playing') : setTimeout(check, 100))
        check()
        setTimeout(() => done('not playing: ' + describe(audio)), 20000)
      })
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return { status: response.status, type: response.headers.get('content-type'), metadataLeft, titles: [...new Set(titles)], played }
    })()`
  )
  const expected = { status: 200, type: 'audio/mpeg', metadataLeft: 0, titles: ['Smoke - Song'], played: 'playing' }
  if (JSON.stringify(result) !== JSON.stringify(expected)) throw new Error(`The radio over tunelle answered ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`)

  // the player gave up both connections: the cancelled fetch and the paused element
  for (let waited = 0; station.connections.open > 0 && waited < 10000; waited += 100) await new Promise(done => setTimeout(done, 100))
  if (station.connections.open > 0) throw new Error(`${station.connections.open} of ${station.connections.total} connections to the station are still open after the player stopped`)
  console.log(`radio over tunelle passed: ${JSON.stringify(result)}, ${station.connections.total} connections, all closed`)
}

// taskkill also takes the helper processes down on windows
const stop = child => {
  if (child.exitCode !== null) return Promise.resolve()
  const exited = new Promise(done => child.once('exit', done))
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill()
  return exited
}

// loads every dependency of the app from inside the package in the node mode of the executable: the one that does not load is the reason for an app that hangs on its error dialog
const loadDependencies = () => {
  const archive = join(resolve(root, resourcesFolder(process.platform, process.arch)), 'app.asar')
  const script = `const { dependencies } = require(${JSON.stringify(join(archive, 'package.json'))})
for (const name of Object.keys(dependencies)) {
  try { require(require.resolve(name, { paths: [${JSON.stringify(archive)}] })); console.log('ok   ' + name) } catch (error) { console.log('FAIL ' + name + ': ' + error.message) }
}`
  const { stdout, stderr, error } = spawnSync(executablePath, ['-e', script], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 30000
  })
  return [stdout, stderr, error?.message].filter(Boolean).join('\n')
}

const run = async () => {
  const port = await freePort()
  const station = await startStation()
  const child = spawn(executablePath, [...args, `--remote-debugging-port=${port}`, '--enable-logging', `--log-file=${logFile}`, `--user-data-dir=${join(home, 'user-data')}`], {
    env: { ...env, TUNELLE_RADIO_DIRECTORY: station.origin },
    stdio: 'inherit'
  })
  try {
    const { webSocketDebuggerUrl } = await findWindowUrl(port, child)
    // the window exists before the page has loaded, which a slow runner shows: the library is asked from the page
    await waitForPage(expression => evaluateIn(webSocketDebuggerUrl, expression), Date.now() + timeout)
    const library = await evaluateIn(webSocketDebuggerUrl, `fetch('tunelle://app/library').then(response => (response.ok ? response.json() : Promise.reject(new Error('/library answered ' + response.status))))`)
    if (!Array.isArray(library)) throw new Error('/library did not answer a list')
    // the flatpak sandbox does not see the folder of the run
    if (!flatpak) await checkTracks(webSocketDebuggerUrl)
    if (!flatpak) await checkRadio(webSocketDebuggerUrl, station)
    const trackCount = Number.isFinite(library.length) ? Math.trunc(library.length) : 0
    console.log(`Smoke test passed: ${trackCount} tracks`)
  } finally {
    station.close()
    await stop(child)
  }
}

run()
  .catch(error => {
    console.error(error)
    if (packaged && !flatpak) console.error(`Packaged dependencies:\n${loadDependencies()}`)
    if (existsSync(logFile)) console.error(`Log of the app:\n${readFileSync(logFile, 'utf8').split(/\r?\n/).map(printable).join('\n')}`)
    process.exitCode = 1
  })
  .finally(() => rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }))
