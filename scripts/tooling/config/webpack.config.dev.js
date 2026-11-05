const baseConfig = require('./webpack.config.base')

module.exports = baseConfig.map(config => Object.assign({}, config, {
  mode: 'development'
}))
