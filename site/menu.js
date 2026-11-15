// on a phone the links of the top bar sit behind a menu button; without this script they stay in the bar
const nav = document.querySelector('.top')
const button = document.getElementById('menu-toggle')

if (nav && button) {
  const set = (open) => {
    nav.dataset.menu = open ? 'open' : 'closed'
    button.setAttribute('aria-expanded', String(open))
  }
  set(false)
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'))
  nav.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) set(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') set(false)
  })
}
