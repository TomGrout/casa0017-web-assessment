// Measure the site header so the map stage starts right below it. The header can
// change height (nav links wrap on small screens), so keep watching it.
const bar = document.querySelector('.live-topbar')
const setTop = () => {
  const h = bar && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0
  document.documentElement.style.setProperty('--topbar-h', `${h}px`)
}
setTop()
if (bar && 'ResizeObserver' in window) new ResizeObserver(setTop).observe(bar)
addEventListener('resize', setTop)
