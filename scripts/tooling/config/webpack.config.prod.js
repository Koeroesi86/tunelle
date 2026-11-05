const baseConfig = require('./webpack.config.base')

module.exports = baseConfig.map(config => Object.assign({}, config, {
  optimization: {
    minimize: true
  }
}))
