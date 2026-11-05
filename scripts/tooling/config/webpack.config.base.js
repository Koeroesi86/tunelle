const path = require('path')
const webpack = require('webpack')
const StaticSitePlugin = require('./static-site-plugin')
const appConfig = require('./appConfig')
const cache = require('./cache')

function recursiveIssuer (m) {
  if (m.issuer) {
    return recursiveIssuer(m.issuer)
  } else {
    for (let chunk of m._chunks) {
      return chunk['name']
    }
    return false
  }
}

const createConfig = ({ name, entry, target, resolveFallback, plugins }) => ({
  name,
  mode: 'production',
  entry: { [name]: entry },
  output: {
    pathinfo: true,
    libraryTarget: 'umd',
    path: path.resolve(__dirname, '../../../build'),
    publicPath: './',
    globalObject: 'this',
    filename: '[name].js'
  },
  target,
  cache: {
    type: 'filesystem',
    cacheDirectory: cache.webpack,
    version: process.env.NODE_ENV || 'development',
    buildDependencies: {
      config: [__filename, require.resolve('./cache'), require.resolve('./appConfig')]
    }
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        loader: 'esbuild-loader',
        options: {
          jsx: 'automatic',
          // the renderer is the Chromium of Electron, which is newer than this
          target: 'chrome124'
        }
      },
      // webpack's asset modules emit the file itself, file-loader would emit a JavaScript module next to the url() of the css
      {
        test: /\.(woff(2)?|ttf|eot|svg|png|jpg|webm|mp4)$/,
        type: 'asset/resource',
        generator: {
          filename: 'bundle/[name]-[hash][ext]'
        }
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: 'style-loader', // creates style nodes from JS strings
            options: {
              injectType: 'singletonStyleTag'
            }
          },
          {
            loader: 'css-loader', // translates CSS into CommonJS
            options: {
              importLoaders: 1,
              modules: {
                namedExport: false,
                exportLocalsConvention: 'as-is',
                localIdentName: (process.env.NODE_ENV === 'production' ? '[sha1:hash:hex:4]' : '[name]__[local]')
              }
            }
          },
          {
            loader: 'sass-loader' // compiles Sass to CSS
          }
        ]
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: { '@shared': path.resolve(__dirname, '../../../shared') },
    fallback: resolveFallback
  },
  plugins
})

// The client runs in the sandboxed renderer (no Node.js), the HTML generator runs in Node.js during the build.
const config = [
  createConfig({
    name: 'client',
    entry: path.resolve(__dirname, '../../../client/app.tsx'),
    target: 'web',
    resolveFallback: { path: require.resolve('path-browserify') },
    plugins: []
  }),
  createConfig({
    name: 'htmlGenerator',
    entry: path.resolve(__dirname, '../../../client/htmlGenerator.tsx'),
    target: 'node',
    plugins: [
      new StaticSitePlugin({
        entry: 'htmlGenerator',
        paths: appConfig.paths,
        locals: appConfig.locals
      })
    ]
  })
]

module.exports = config
