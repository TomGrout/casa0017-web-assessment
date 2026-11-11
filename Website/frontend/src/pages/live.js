// Page: Live map – live, next-24-hour and 7-day sewage risk for river users on the Thames.
// The app lives in src/river/; the model is shared with the backend (Website/shared/river).
import '../river/style.css'
import '../river/live-layout.css'
import { mountSiteNav } from '../river/site-nav.js'

mountSiteNav(document.getElementById('siteNav')) // before the map loads, so the header has its final height
await import('../river/live-layout.js')
await import('../river/app.js')
