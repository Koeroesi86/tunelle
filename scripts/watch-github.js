const net = require('net')
const { spawn } = require('child_process')

// usage: node scripts/watch-github.js <seconds> <command> [arguments...]
// the hosts file of the machine has to send the addresses of GitHub to this machine (see .github/workflows/wack.yml): this listens where they land,
// starts the command, waits and fails when anything connected while it ran. A request of its own comes first, to show that the listener sees what is
// sent to GitHub (a hosts file that was not applied would pass the check for the wrong reason)
const listen = (port, connections) =>
  new Promise((resolve, reject) => {
    // dual stack: the hosts file sends the names to ::1 and 127.0.0.1
    const server = net.createServer(socket => {
      connections.push(`${socket.remoteAddress} to port ${server.address().port}`)
      socket.destroy()
    })
    server.once('error', reject)
    server.listen({ port, host: '::', ipv6Only: false }, () => resolve(server))
  })

/** The connections that were made while `run` ran and `wait` waited; `probe` gets the ports and has to be seen first */
const watch = async ({ ports, probe, run, wait }) => {
  const connections = []
  const servers = await Promise.all(ports.map(port => listen(port, connections)))

  try {
    await probe(servers.map(server => server.address().port))
    if (connections.length === 0) throw new Error('The control request did not reach the listener: the hosts file does not send GitHub here')
    connections.length = 0

    await run()
    await wait()
    return [...connections]
  } finally {
    servers.forEach(server => server.close())
  }
}

module.exports = { watch }

if (require.main === module) {
  const [seconds, command, ...args] = process.argv.slice(2)
  if (!seconds || !command) {
    console.error('usage: node scripts/watch-github.js <seconds> <command> [arguments...]')
    process.exit(1)
  }

  watch({
    ports: [443, 80],
    probe: () => fetch('https://api.github.com/', { signal: AbortSignal.timeout(5000) }).catch(() => undefined),
    run: () =>
      new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' })
        child.once('error', reject)
        child.once('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))))
      }),
    wait: () => new Promise(resolve => setTimeout(resolve, Number(seconds) * 1000))
  })
    .then(connections => {
      if (connections.length > 0) throw new Error(`${connections.length} connection(s) to GitHub while the command ran: ${connections.join(', ')}`)
      console.log(`No connection to GitHub in ${seconds} seconds after the start`)
    })
    .catch(error => {
      console.error(error.message)
      process.exit(1)
    })
}
