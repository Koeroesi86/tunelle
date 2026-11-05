process.env.BABEL_ENV = 'development'
process.env.NODE_ENV = 'development'

const { spawn } = require('child_process')
const path = require('path')

const startDevServer = () => {
  return new Promise((resolve, reject) => {
    const devServer = spawn(
      'npm',
      [
        'run',
        'build',
        '--',
        '--watch'
      ],
      {
        shell: true,
        env: process.env,
        stdio: ['pipe', 'pipe', process.stderr],
        cwd: path.resolve(__dirname, '../../')
      }
    )

    devServer.stdout.on('data', data => {
      process.stdout.write(data)
      if (/Version: webpack/.test(data.toString())) {
        resolve()
      }
    })

    devServer.on('close', code => process.exit(code))
    devServer.on('error', spawnError => reject(spawnError))
  })
}

startDevServer()
  .then(() => {
    const electronApp = spawn(
      'npm',
      [
        'run',
        'start'
      ],
      {
        shell: true,
        env: process.env,
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '../../')
      }
    )

    electronApp.on('close', code => process.exit(code))
    electronApp.on('error', spawnError => console.error(spawnError))
  })
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
