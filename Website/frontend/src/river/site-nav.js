// Site navigation for the Live map pages: the team's nav-bar component (src/components/nav-bar.js),
// used as-is, plus a "Live map" link added here so the shared component isn't changed.
import { createNavBar } from '../components/nav-bar.js'

export function mountSiteNav(el) {
  if (!el) return
  const nav = createNavBar()
  nav.setAttribute('aria-label', 'Site')
  const first = nav.querySelector('li')
  const live = document.createElement('li')
  live.innerHTML = '<a href="/live.html">Live map</a>'
  first ? first.after(live) : nav.querySelector('ul')?.append(live)
  const active = el.dataset.active || location.pathname
  nav.querySelectorAll('a').forEach((a) => {
    if (a.getAttribute('href') === active || (active === '/live-method.html' && a.getAttribute('href') === '/live.html')) {
      a.setAttribute('aria-current', 'page')
    }
  })
  el.append(nav)
}
