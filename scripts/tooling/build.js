const webpack = require('webpack')
const webpackConfig = require('./config/webpack.config.prod')

process.env.NODE_ENV = 'production'

console.log('Build started...')
const compiler = webpack(webpackConfig)
compiler.run((err, stats) => {
  if (err) {
    console.error(err)
    process.exitCode = 1
    return
  }
  console.log(stats.toString({
    chunks: false,
    colors: true
  }))
  // a module that fails to compile must fail the build, not only print
  if (stats.hasErrors()) process.exitCode = 1
})
