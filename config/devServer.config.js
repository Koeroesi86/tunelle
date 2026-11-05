const { resolve } = require('path')
const { spawn } = require('child_process')

// VS Code terminals set ELECTRON_RUN_AS_NODE, which starts electron as plain node without the app module
const { ELECTRON_RUN_AS_NODE, ...env } = process.env
// the chrome-sandbox helper of node_modules needs root to be set up, as in scripts/checks/smoke.js the development run goes without it on linux
const sandboxArgs = process.platform === 'linux' ? ['--no-sandbox'] : []

module.exports = function (host, port) {
  return {
    host,
    port,
    compress: true,
    hot: true,
    client: {
      logging: 'warn'
    },
    historyApiFallback: {
      disableDotRule: true,
      index: '/index.html',
      rewrites: [
        { from: /.+/, to: '/404.html' }
      ],
      htmlAcceptHeaders: ['text/html', 'application/xhtml+xml']
    },
    onListening () {
      const electronApp = spawn(
        'electron',
        [
          resolve(__dirname, '../out/index.js'),
          ...sandboxArgs,
          `--webpackPort=${port}`
        ],
        {
          shell: true,
          env,
          stdio: 'inherit',
          cwd: resolve(__dirname, '../')
        }
      )
      electronApp.on('close', code => process.exit(code))
      electronApp.on('error', spawnError => console.error(spawnError))
      process.on('exit', () => electronApp.kill())
    }
  }
}
