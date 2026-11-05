// the window exists, and answers, before it has loaded the page: it shows the initial blank page until then, from which the tunelle protocol is refused
// (a fetch fails with "Failed to fetch"), and the context of that page is gone once the navigation commits, which fails an evaluation that was waiting in it
const pageRendered = `location.href === 'tunelle://app/index.html' && document.getElementById('root')?.childElementCount > 0`

const wait = milliseconds => new Promise(done => setTimeout(done, milliseconds))

// asks the window (evaluate takes an expression and answers its value) until the page is rendered, and fails when it is not before the deadline with the last thing it said
const waitForPage = async (evaluate, deadline, interval = 250, last = 'no answer') => {
  if (Date.now() > deadline) throw new Error(`The page did not render, the window said: ${last}`)

  const answer = await evaluate(pageRendered).then(
    rendered => ({ rendered, said: `${rendered}` }),
    error => ({ rendered: false, said: error.message })
  )
  if (answer.rendered) return

  await wait(interval)
  return waitForPage(evaluate, deadline, interval, answer.said)
}

module.exports = { waitForPage }
