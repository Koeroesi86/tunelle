const { readdirSync, readFileSync } = require('fs')
const { basename, join, resolve } = require('path')

// the pages of the website: site/templates/<page>.html filled with site/strings/<language>.json, one folder per language (English at the root, so
// its addresses never changed). See docs/development/website.md.
const siteRoot = resolve(__dirname, '../..', 'site')
const origin = 'https://koeroesi86.github.io/tunelle/'
const defaultLanguage = 'en'

const readNames = (folder, extension) =>
  readdirSync(join(siteRoot, folder))
    .filter((name) => name.endsWith(extension))
    .map((name) => basename(name, extension))
    .sort()

const loadLanguages = () =>
  Object.fromEntries(readNames('strings', '.json').map((tag) => [tag, JSON.parse(readFileSync(join(siteRoot, 'strings', `${tag}.json`), 'utf8'))]))

const loadTemplates = () => Object.fromEntries(readNames('templates', '.html').map((name) => [name, readFileSync(join(siteRoot, 'templates', `${name}.html`), 'utf8')]))

const folderOf = (tag) => (tag === defaultLanguage ? '' : `${tag}/`)
const fileOf = (name) => (name === 'index' ? '' : `${name}.html`)
// where the page is written, relative to the site
const pagePath = (tag, name) => `${folderOf(tag)}${name}.html`
const pageUrl = (tag, name) => `${origin}${folderOf(tag)}${fileOf(name)}`
// the path from a page of one language to the same page of another
const relativeLink = (from, to, name) => `${from === defaultLanguage ? '' : '../'}${folderOf(to)}${fileOf(name)}` || './'

const renderAlternates = (tags, name) =>
  [...tags.map((tag) => [tag, pageUrl(tag, name)]), ['x-default', pageUrl(defaultLanguage, name)]]
    .map(([tag, url]) => `<link rel="alternate" hreflang="${tag}" href="${url}" />`)
    .join('\n    ')

const renderSwitcher = (languages, tag, name) =>
  `<span class="languages" role="group" aria-label="${languages[tag]['meta.languages']}">${Object.entries(languages)
    .filter(([other]) => other !== tag)
    .map(([other, strings]) => `<a href="${relativeLink(tag, other, name)}" hreflang="${other}" lang="${other}">${strings['meta.languageName']}</a>`)
    .join('')}</span>`

const renderPage = (template, { languages, tag, name }) => {
  const strings = languages[tag]
  const filled = template.replace(/\{\{t:([\w.]+)\}\}/g, (_, key) => {
    if (!(key in strings)) throw new Error(`${tag}.json has no "${key}", used by ${name}.html`)
    return strings[key]
  })

  return filled
    .replace(/\{\{lang\}\}/g, tag)
    .replace(/\{\{base\}\}/g, tag === defaultLanguage ? '' : '../')
    .replace(/\{\{url\}\}/g, pageUrl(tag, name))
    .replace(/\{\{alternates\}\}/g, renderAlternates(Object.keys(languages), name))
    .replace(/\{\{switcher\}\}/g, renderSwitcher(languages, tag, name))
}

// every page of every language: [path, html] (the release is written in afterwards by stampSite)
const renderPages = () => {
  const languages = loadLanguages()
  const templates = loadTemplates()
  return Object.keys(languages).flatMap((tag) => Object.entries(templates).map(([name, template]) => [pagePath(tag, name), renderPage(template, { languages, tag, name })]))
}

module.exports = { defaultLanguage, loadLanguages, loadTemplates, pagePath, pageUrl, relativeLink, renderPage, renderPages }
