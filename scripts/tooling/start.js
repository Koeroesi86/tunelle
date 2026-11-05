'use strict'

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development'
process.env.NODE_ENV = 'development'

// Makes the script crash on unhandled rejections instead of silently
// ignoring them.
process.on('unhandledRejection', err => {
  throw err
})

const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const config = require('../../config/webpack.config.dev')
const createDevServerConfig = require('../../config/devServer.config')

const port = parseInt(process.env.PORT, 10) || 3000
const host = process.env.HOST || '0.0.0.0'

if (process.env.HOST) {
  console.log(`Attempting to bind to HOST environment variable: ${process.env.HOST}`)
  console.log(`If this was unintentional, check that you haven't mistakenly set it in your shell.`)
}

const devServer = new WebpackDevServer(createDevServerConfig(host, port), webpack(config))

console.log('Starting the development server...\n')
devServer.start().catch(err => {
  console.error(err.message)
  process.exit(1)
});

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => {
    devServer.stop().finally(() => process.exit(0))
  })
})
