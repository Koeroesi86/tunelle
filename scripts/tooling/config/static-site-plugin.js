const { runInThisContext } = require('vm')
const { sources, Compilation } = require('webpack')

const pluginName = 'StaticSitePlugin'

// Renders the default export of a bundle built for node to one html asset per path.
class StaticSitePlugin {
  constructor ({ entry, paths, locals }) {
    this.entry = entry
    this.paths = paths
    this.locals = locals
  }

  apply (compiler) {
    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: pluginName, stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE },
        () => this.render(compilation)
      )
    })
  }

  render (compilation) {
    const asset = compilation.getAsset(`${this.entry}.js`)
    if (!asset) {
      compilation.errors.push(new Error(`Source file not found: "${this.entry}.js"`))
      return
    }

    const exported = { exports: {} }
    runInThisContext(`(function (module, exports, require) {${asset.source.source()}\n})`, { filename: this.entry })(
      exported,
      exported.exports,
      require
    )
    const render = exported.exports.default || exported.exports
    if (typeof render !== 'function') {
      compilation.errors.push(new Error(`Export from "${this.entry}" must be a function that returns an HTML string`))
      return
    }

    this.paths.forEach((path) => {
      const name = path.replace(/^[/\\]/, '')
      if (compilation.getAsset(name)) return
      compilation.emitAsset(name, new sources.RawSource(render({ path, ...this.locals })))
    })
  }
}

module.exports = StaticSitePlugin
