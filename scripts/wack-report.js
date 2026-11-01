const { readFileSync } = require('fs')

// usage: node scripts/wack-report.js <report.xml>
// reads the report of the Windows App Certification Kit (appcert.exe test ... -reportoutputpath) and fails when the package did not pass
// the report is UTF-16 with a byte order mark; a test is `<TEST NAME="..."><RESULT><![CDATA[PASS]]></RESULT>...` and its messages are `TEXT="..."`
const decode = buffer => (buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString('utf16le') : buffer.toString('utf8')).replace(/^﻿/, '')

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ''

const summarise = buffer => {
  const xml = decode(buffer)
  const tests = [...xml.matchAll(/<TEST\b([^>]*)>([\s\S]*?)<\/TEST>/g)].map(([, tag, body]) => ({
    name: attribute(tag, 'NAME'),
    result: body.match(/<RESULT>\s*(?:<!\[CDATA\[)?\s*(\w+)/)?.[1] ?? '',
    messages: [...body.matchAll(/\bTEXT="([^"]*)"/g)].map(([, text]) => text)
  }))

  return {
    overall: attribute(xml.match(/<REPORT\b[^>]*>/)?.[0] ?? '', 'OVERALL_RESULT'),
    tests,
    failures: tests.filter(({ result }) => result === 'FAIL'),
    warnings: tests.filter(({ result }) => result === 'WARNING')
  }
}

const describeTests = (title, tests) =>
  tests.length === 0 ? [] : [title, ...tests.flatMap(({ name, messages }) => [`  ${name}`, ...messages.map(message => `    ${message}`)])]

const problemsOf = ({ overall, tests, failures }) => [
  ...(tests.length === 0 ? ['The report has no tests: the kit did not run'] : []),
  ...(overall !== 'PASS' && failures.length === 0 && tests.length > 0 ? [`The overall result is ${overall || 'missing'}`] : []),
  ...failures.map(({ name }) => `Failed: ${name}`)
]

module.exports = { summarise, describeTests, problemsOf }

if (require.main === module) {
  const path = process.argv[2]
  if (!path) {
    console.error('usage: node scripts/wack-report.js <report.xml>')
    process.exit(1)
  }

  const summary = summarise(readFileSync(path))
  console.log(`Overall result: ${summary.overall || 'missing'}, ${summary.tests.length} tests`)
  describeTests('Warnings:', summary.warnings).forEach(line => console.log(line))
  describeTests('Failures:', summary.failures).forEach(line => console.log(line))

  const problems = problemsOf(summary)
  problems.forEach(problem => console.error(problem))
  process.exit(problems.length === 0 ? 0 : 1)
}
