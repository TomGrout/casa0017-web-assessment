# Live map — Thames sewage risk for river users (developer guide)

The **Live map** page of Rain To Spill (`live.html`) is a live and 7-day **sewage risk** map for people on the River Thames (rowers, paddlers, swimmers, sailors). It answers one question in plain language — *is sewage likely on my stretch right now, over the next 24 hours and over the next 7 days?* — with a traffic light, a 24-hour strip (sewage risk, rain, tide), a 7-day row, citizen sighting reports, WhatsApp alerts for a chosen stretch, shareable/exportable outlooks and an embeddable status card for club websites. `live-method.html` explains every step with the live parameter values (linked from the map; the team's Method page is unchanged).

## How it fits into Rain To Spill

```
Website/
├─ shared/river/                 ← one copy of the model, used by BOTH sides
│   ├─ config.js                 every tunable (thresholds, hydraulics, tide, uncertainty, UI text)
│   ├─ model/ river.js impact.js risk.js context.js worker.js
│   └─ data/  thamesCentreline.js util.js thames-centreline.geojson
├─ backend/  (existing Express + MySQL + cron + Socket.IO)
│   ├─ src/routes/river.routes.js            /api/river/*
│   ├─ src/controllers/river.controller.js   inputs, status, sightings, subscribe, health
│   ├─ src/controllers/whatsapp.controller.js  webhook (YES / STOP / STATUS / location pin)
│   ├─ src/services/riverInputs.service.js   gathers model inputs, using existing services:
│   │      thamesWater.service  fetchDischargeStatus()  (all watercourses, paged, read-only)
│   │      tideForecast.service fetchTideForecast()     (EasyTide, London Bridge 0113)
│   │      EA flood-monitoring flows · Open-Meteo rain · propensity from spill_event
│   ├─ src/services/riverModel.service.js    runs the shared model server-side
│   ├─ src/services/riverAlerts.service.js   WhatsApp status-change updates
│   ├─ src/services/whatsapp.service.js · recaptcha.service.js
│   ├─ src/db/river.sql + initRiver.js       river_subscriber, river_sighting, river_wa_message
│   ├─ src/db/queries/river.queries.js
│   ├─ src/jobs/riverAlerts.js               cron (default every 15 min)
│   └─ scripts/river/                        build-clubs.mjs, build-thames-centreline.mjs, clubs-extra.csv
└─ frontend/ (existing Vite multi-page site)
    ├─ live.html → src/pages/live.js → src/river/app.js   the map (MapLibre + deck.gl + ECharts), below a slim site header
    ├─ live-method.html → src/pages/live-method.js → src/river/methodology.js
    └─ src/river/ spots.js share.js site-nav.js style.css live-layout.css/js methodology.css
```

- The browser asks the backend **once** for everything (`GET /api/river/inputs`) and runs the 17-run ensemble model in a Web Worker, so the time slider is instant. The backend caches inputs for 10 minutes so many visitors share one set of upstream calls.
- The backend runs the **same model module** on a schedule for WhatsApp alerts and `GET /api/river/status`.
- Tide predictions now come from the team's existing **EasyTide** service, so no ADMIRALTY API key is needed.
- Spill **propensity** (how often each overflow spills) now comes from the team's `spill_event` table (EDM history), instead of a separate CSV script.
- Built on the latest `main` (Nov 11, `d8c2b77`, incl. Luca's backend data fixes). **No colleague's page, component, style or script is changed**: `index.html`, `triggers.html`, `tide.html`, `method.html`, their `src/pages/*.js`, `src/components/*`, `src/style.css` and `GroupProject/` are untouched. The live pages only *add* files; their header uses the team's `components/nav-bar.js` as-is and adds a "Live map" link in its own code (`src/river/site-nav.js`).
- When Luca's pages (feature/triggers-data) are merged, the only follow-up is optional: point his top bar's "Live map" link at `/live.html`, and, if you like, swap the live pages' slim header for his top bar.

### Changes to existing files (all small and backwards-compatible)

| File | Change | Why |
|---|---|---|
| `backend/src/app.js` | mounts `/api/river`; `express.json` keeps `req.rawBody`; `trust proxy`; error handler honours `err.status` | routes; WhatsApp signature check; per-IP limits behind a proxy |
| `backend/src/server.js` | creates river tables, starts the river alerts cron (independent of `CRON_ENABLED`; switch off with `RIVER_ALERTS_ENABLED=false`) | |
| `backend/src/services/thamesWater.service.js` | `fetchDischargeStatus({ cache: false })` skips writing to `outfalls` | the river map reads every watercourse and must not add non-London outfalls to the team's table |
| `backend/src/services/tideForecast.service.js` | `EASYTIDE_BASE_URL` env override | testing |
| `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.dockerignore` | build context = `Website/`; `shared/` copied/mounted at `/app/shared` | both images need the shared model |
| `frontend/vite.config.js` | adds `live` and `liveMethod` pages; dev port 5173 (3000 is the backend), `fs.allow` Website/, ES worker, es2022 | new pages, shared folder, Web Worker, top-level await |
| `frontend/package.json` | maplibre-gl, @deck.gl/*, d3, echarts | map and charts |

## Run it

```bash
cd Website
cp backend/.env.example backend/.env       # DB settings; river settings at the bottom (DRY_RUN=1)
cp frontend/.env.example frontend/.env     # VITE_API_URL=http://localhost:3000
docker compose up -d --build               # MySQL :3306, backend :3000, frontend :5173
# open http://localhost:5173/live.html
```

Without Docker: start MySQL, then `cd backend && npm install && npm run dev`, and `cd frontend && npm install && npm run dev`.

Optional: `cd backend && npm run river:clubs` builds `frontend/public/clubs.json` (river clubs from OpenStreetMap) — the search already finds clubs and places live without it.

## API

| Method & path | What it returns |
|---|---|
| `GET /api/river/inputs` | `{ now, overflows[], gauges[], highWaters{source,quality,times[],events[]}, rain{dp,byKey}, propensity{permit: 0..1}, problems[] }` — the model's inputs. Cached `RIVER_INPUTS_CACHE_MINUTES`. 503 if Thames Water is unreachable and nothing is cached. |
| `GET /api/river/status?lon=&lat=&r=3` | `{ place, now{risk,label,advice,certainty}, next{risk,rising,at}, days[{day,date,risk}] }` for a stretch (server-side model). Handy for other pages, e.g. a "river now" badge. |
| `GET /api/river/sightings?days=7` | GeoJSON of public sighting reports (unverified). |
| `POST /api/river/sightings` | `{ lon, lat, types[], severity 1-3, note?, observedAt?, captcha }` → 201. reCAPTCHA v3 verified when `RECAPTCHA_SECRET` is set. |
| `DELETE /api/river/sightings/:id` | hides a report (header `x-admin-token: $ADMIN_TOKEN`). |
| `POST /api/river/subscribe` | `{ phone, lon, lat, radiusKm 1/3/5/10, threshold low/moderate/high, activity, name, consent }` → WhatsApp opt-in template. |
| `GET/POST /api/river/whatsapp/webhook` | Meta webhook (verification + replies). |
| `GET /api/river/health` | model time, data gaps, active subscribers, DRY_RUN flag. |

### Data shape assumptions
- Thames Water fields follow the team's `normalizeOutfall()` (v2 camelCase: `permitNumber`, `x`, `y`, `alertStatus`, `alertPast48Hours`, `mostRecentDischargeAlertStart/Stop`). Times without an offset are treated as UK clock time (`thamesWater.timesAreUtc`).
- EasyTide `dateTime` values without an offset are treated as UTC.
- Propensity joins live data to `spill_event.outfall_id` by **permit number**; overflows with no history use `forecast.siteBase`.

## WhatsApp alerts

```
 Alerts tab ──POST /api/river/subscribe──► backend: river_subscriber row (pending)
                                           ▼
                 WhatsApp template "thames_alert_optin"  ──►  user replies YES
                                           ▲                            │
 Meta webhook POST /api/river/whatsapp/webhook ◄────────────────────────┘
   YES → active · STOP → row deleted · STATUS → current status · location pin → move area

 cron (RIVER_ALERTS_SCHEDULE): fresh inputs → shared model → traffic light of each stretch →
 changed? rise: send now · easing: after 60 min · early warning of a forecast rise (mode "low") →
 template "thames_status_update" with a link to the stretch's forecast
```

Go live: create a Meta app with WhatsApp, put `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` in `backend/.env`, create the two templates (English UK, Utility), point the webhook to `https://<backend>/api/river/whatsapp/webhook` (HTTPS required), subscribe to `messages`, and remove `DRY_RUN=1`.

| Template | Body |
|---|---|
| `thames_alert_optin` | `You asked for Thames sewage-overflow alerts within {{1}} km of {{2}}. Reply YES to confirm or STOP to cancel.` (quick replies YES / STOP) |
| `thames_status_update` | `Thames update for {{1}}: {{2}}. {{3}} 7-day outlook: {{4}}. {{5}} Full forecast: {{6}} This is a model estimate, not a water test. Reply STATUS for details or STOP to unsubscribe.` |

Personal data: only phone number, chosen spot, radius, level, activity and alert timestamps (MySQL `river_subscriber`); unconfirmed sign-ups deleted after 48 h; STOP deletes the row. Sightings store no personal data; IP addresses are only counted in memory for rate limits.

Backend settings: `backend/src/config/river.js` (quiet hours, hold times, radii, retention, rate limits).

## Find your spot: place and river-club search

**Works straight away (no build step):** after 3 letters the search also asks two free online gazetteers and merges their answers under *Clubs* and *Places*, keeping only results near the Thames and showing how far each is from the river:

- **OS Open Names via postcodes.io** (`GET https://api.postcodes.io/places?q=…&limit=10`) — neighbourhoods, villages and towns, e.g. *Canary Wharf*, *Mortlake*, *Henley-on-Thames*.
- **Photon by komoot** (`GET https://photon.komoot.io/api/?q=…&bbox=…&lat=…&lon=…`, OpenStreetMap data) — named places and points of interest, including clubs, e.g. *Thames Rowing Club*, *Docklands Sailing and Watersports Centre*. A result counts as a **club** if its name says rowing/sculling/boat club/sailing/yacht/canoe/kayak/paddle/cadets/scouts/swim… or its OSM tag is `sports_club`, `sports_centre`, `club`, `water_sports`, `marina` or `slipway`.

Choosing a **place or postcode** opens the stretch of river nearest to it (the spot moves onto the river and a note says how far away it was); choosing a **club** keeps the club's own position.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| S6 | Online search after 3 letters, 350 ms after you stop typing | `spots.remoteMinChars`, `spots.remoteDebounceMs` | Fewer requests |
| S7 | Only results inside the Thames box (−2.2,51.2 → 1.0,51.95) are used; Photon prefers results near London | `spots.searchBbox`, `spots.searchFocus` | Focus on the upper Thames |
| S8 | A place/postcode up to 8 km from the river opens the nearest stretch | `spots.searchSnapKm` | Stricter matching |
| S9 | An OSM point counts as a river club only within 1.5 km of the river | `spots.clubMaxOffKm` | Clubhouses set back from the bank |
| S10 | Both services allow requests straight from the browser (CORS); Photon's public server is fair-use only | `spots.placesUrl`, `spots.photonUrl` (set `null` to switch off, or point at your own Photon) | Heavy traffic: self-host Photon |

**Optional extra: a built club list.** `npm run river:clubs` builds `frontend/public/clubs.json` from OpenStreetMap, which makes clubs appear instantly (even offline), lets you search by kind ("rowing", "sea cadets") and draws clubs as dots on the map:

The search bar on the map suggests as you type, grouped as **Saved spots → Postcode → Clubs → Places → Coordinates**. Type part of a club name ("thames row", "tedd"), or a kind of club ("rowing", "sculling", "sea cadets", "kayak", "swim") to list clubs of that kind.

There is no open, licensed directory of Thames clubs (Active Thames is a Tideway-funded grant programme managed with the PLA, not a club list), so the club list is built from **OpenStreetMap** with one command:

```bash
npm run river:clubs                         # needs internet access to overpass-api.de (~1–3 minutes)
npm run river:clubs -- --radius=800         # look further from the river line (metres)
npm run river:clubs -- --fixture=saved.json # rebuild from a saved Overpass response (offline)
```

It queries features within 600 m of the OS Open Rivers centreline that are tagged with a water sport or whose name says rowing, sculling, boat club, canoe, kayak, sailing, yacht, sea cadets/scouts, swimming club, paddle, dragon boat, etc.; drops pubs, shops, roads and indoor pools; classifies each club; snaps it to the river; and de-duplicates. **Missing or misplaced clubs:** add a row to `backend/scripts/river/clubs-extra.csv` (`name,category,lat,lon,website`; categories `rowing, paddle, sailing, cadets, swimming, other`) and run it again — or, better for everyone, fix the club in OpenStreetMap. The app credits "© OpenStreetMap contributors" (ODbL) in the About panel, as the licence requires.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| CL1 | A club is "on the Thames" if OSM places it within 600 m of the centreline, and it is kept if it snaps within 1 km | `--radius`, `--max-off` in `backend/scripts/river/build-clubs.mjs` | Clubhouses set back from the bank; tidal creeks |
| CL2 | Category from the name first, then the `sport=*` tag | `CATS` in `build-clubs.mjs` | Add e.g. "dragon boat" as its own category |
| CL3 | Same normalised name within 500 m = duplicate; the CSV row wins | `norm()`, 0.5 km in `build-clubs.mjs` | Clubs with several sites |
| CL4 | Search ranking: name prefix > word prefix > all words > substring (4+ letters); saved spots ranked first | `textScore()`, `per` limits in `frontend/src/river/spots.js` | Show more than 6 clubs per query |
| CL5 | Kind words ("row", "scull", "kayak", "cadet", "swim" …) list clubs of that kind | `CATEGORY_WORDS` in `frontend/src/river/spots.js` | Add local terms ("skiff", "punt") |
| CL6 | Clubs show as small white dots from zoom 11 | `CLUB_MIN_ZOOM` in `frontend/src/river/app.js` | Busier/quieter map |
| CL7 | 120 ms debounce for local matches, 300 ms when digits (postcode) are typed | `runSearch` timers in `frontend/src/river/app.js` | Slower phones |

## Next 24 hours: sewage, rain and tide

Below the traffic light (and in the embed card) a strip shows the next 24 hours for the spot, hour by hour: **Sewage** (that hour's traffic light), **Rain** (bars: light / moderate / heavy) and **Tide** (a tide line with ▲ high and ▼ low water times), followed by three plain sentences, e.g. *"Moderate risk until 03:00, then low until 09:00…"*, *"Heavy rain at times, mainly 05:00–12:00; heaviest around 11:00 (9.0 mm/h). About 26 mm in total. Rain like this can set off overflows within a few hours."*, *"Rising now — water is flowing upstream, so sewage from overflows downstream can reach you. High 12:54 · low 08:48."* On phones the half-height sheet shows the light, this strip and the time slider. Code: `shared/river/model/context.js` (pure functions), drawn by `stripHtml()` / `daySummaryHtml()` in `frontend/src/river/app.js`.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| X1 | Rain strength per hour: light ≤ 2.5, moderate 2.6–7.6, heavy > 7.6 mm/h (AMS glossary); < 0.1 mm = dry | `context.rain` | Use Met Office or your own bands |
| X2 | Rain for a spot = mean of forecast cells within 15 km (else nearest within 30 km). Cells exist where there are overflows | `context.rainRadiusKm`, `rainFallbackKm` | Fetch a dedicated grid around spots |
| X3 | > 6 mm in 24 h triggers the "can set off overflows" sentence | `context.wetDayMm` | Tie it to `forecast.r50mm` |
| X4 | Tide times = ADMIRALTY London Bridge (Tower Pier) high/low waters + PLA average time differences, interpolated by river distance; clamped (approx.) below Greenland Dock and above Teddington | `context.tideOffsets` (name, position, hw/lw minutes) | Add Woolwich/Gravesend from ADMIRALTY secondary ports |
| X5 | Without ADMIRALTY data: HW every 12.42 h from the last known HW, LW halfway, labelled "approx." | `tideEventsLB()` | — |
| X6 | Tide line drawn as a half-cosine between events (labels carry the real times) | `tideForSpot()` | Use EA observed levels for the past part |
| X7 | Summary times are rounded to the hour (model frames are hourly but not on the hour) | `toHour()` in `main.js` | — |
| X8 | Embed heights raised to fit the strip: card 720 px, card + map 920 px | `CONFIG.embed.heights` | — |

## Saying what the risk means

Every light is a **sewage risk**: how likely it is that sewage from storm overflows is in the water on the stretch (a health risk if swallowed or through cuts). Labels read *Low / Moderate / High sewage risk* everywhere (status, map chip, 24-hour summary, share card, WhatsApp), the headings say *Next 24 hours · sewage risk each hour* and *Next 7 days · highest sewage risk each day*, and a "What this means" line sits under the light.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| M1 | One wording for all three time frames | `CONFIG.risk.levels.*.label` (long), `.short` (day chips) | e.g. "Low sewage risk" → "Sewage unlikely" |
| M2 | Plain explanation of the risk under the light and in the embed | `CONFIG.risk.meaning` | Add your club's own advice |
| M3 | Section headings (Right now · Next 24 hours · Next 7 days) | `#nowH`, `#dayH`, `#weekH` in `frontend/live.html` (and the embed card in `renderEmbed()`) | — |

## Layout on PC and phone

**Less text (user feedback, Nov 11):** the panel shows only the light, a one-line action ("Sewage likely. Avoid swallowing water and cover cuts."), the next change, the 24-hour strip, the 7-day chips (icons only) and the time slider. Explanations sit in dropdowns: *What does this mean?*, *Sewage, rain and tide in words*, *Share, download or embed*, *Map options*, and on the Report/Alerts tabs *Serious pollution?* and *How sign-up works*. On wide screens the panel can be **closed** (✕); a "☰ Your spot" button and the on-map status chip bring it back, and the choice is remembered in this browser. Phones keep the bottom sheet.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| L6 | One-line advice per light | `CONFIG.risk.levels.*.advice` | Your club's own wording |
| L7 | Which explanations start folded | the `<details class="fold">` blocks in `frontend/live.html` (add `open` to start expanded) | Show more by default |
| L8 | Closed panel remembered per browser | `PANEL_KEY` in `frontend/src/river/app.js` (localStorage) | Always start open |

- **Find-your-spot bar:** one search bar at the top with the spot buttons built in — ◎ locate me, ☆/★ saved spots (drops down under the bar with each spot's live light) and ＋ save this spot. Saved spots are always shown on the map as labelled ☆ pins; tap one to open it.
- **Wide screens (> 700 px):** 400 px side panel with tabs **Status / Report / Alerts**; a coloured status chip stays on the map; key open by default; hover tooltips.
- **Phones (≤ 700 px):** a bottom sheet with three positions — **peek** (traffic light only), **half** (light, time slider and 7-day row) and **full** (everything; Report/Alerts tabs open it fully). Drag or tap the handle. Map +/− buttons are hidden (pinch to zoom); controls are 46 px and sit above the sheet; tapping an overflow, sighting or club opens an info card (no hover on touch screens).
- Body text 16 px, controls ≥ 44 px on phones, safe-area insets for notched phones, sizes in rem so the phone's text-size setting is respected.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| L1 | Phone layout below 701 px wide | `@media (max-width: 700px)` in `style.css`, `PHONE` in `main.js` | Tablets in portrait |
| L2 | Sheet heights: peek 156 px ("Right now" heading + light); half 52 % of the screen (min 380 px); full = screen − 76 px | `SNAP` in `main.js` | Very small phones (iPhone SE: 667 px tall) |
| L3 | Picking a spot from peek opens the sheet to half | `setSpot()` | Keep more map visible |
| L4 | Desktop panel 400 px | `--panel-w` in `style.css` | Wider screens |
| L5 | Locate me only replaces your spot when you press ◎ (or your spot came from GPS); tracking never overrides a club/saved spot | geolocate handler in `main.js` | — |

## Embed on a club website

Choose a spot → **Embed on your club's website** → pick **Status card** (430 px tall) or **Card + map** (640 px) → copy the `<iframe>` code into the site's HTML/Embed block. The embed URL is the normal spot link plus `&embed=card` or `&embed=map`, so it always shows the live status, 7-day row, advice and a link to the full forecast; the panel, forms and controls are hidden.

Framing headers are a hosting decision: send `Content-Security-Policy: frame-ancestors *` for `?embed=` URLs and `frame-ancestors 'self'` (+ `X-Frame-Options: SAMEORIGIN`) for everything else, so the full app with its sign-up and report forms can't be framed by other sites (clickjacking protection). See E1.

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| E1 | Any website may embed the status card/map. The Vite dev server sends no framing headers; on your production host send `Content-Security-Policy: frame-ancestors *` for `?embed=` URLs and `frame-ancestors 'self'` for everything else | your web server / CDN config | Restrict to known club sites |
| E2 | Suggested iframe heights 720 / 920 px | `CONFIG.embed.heights` | Clubs' own layouts |
| E3 | The embedded map is look-only (taps open info cards; the spot is fixed by the club) | map click handler in `main.js` | Let visitors move the spot |
| E4 | If the plain map link is put in an iframe without `?embed=`, it shows the embed map view | `EMBED` in `frontend/src/river/app.js` | — |


---

## How the model works

```
EDM status ──► emission per 15-min step (weight = spill-hours)
rain fcst ───► P(spill) per forecast hour × propensity ──► forecast emission
                     │
           tributary delay = off-river distance × sinuosity ÷ v_trib
                     ▼
   non-tidal: c += v(Q)·dt        v = a·Q^b (EA flow at nearest upstream gauge)
   tidal:     c = mean − (E/2)·cos(2π (t−HWprev)/(HWnext−HWprev)),  mean += net drift·dt,  c ≥ Teddington
                     ▼
   impact(x,t) = Σ w · 10^(−age/T90) · N(x; c, σ²),   σ² = σ0² + 2·D·age      [SH/km], hourly, 0.5 km
                     ▼
   run 0 = central inputs, forecast spills weighted by p          → "central estimate"
   runs 1…16 = inputs drawn at random, forecast spills happen/not → mean, SD, 10th/90th pct, P(≥ low/moderate/high)
```

Thresholds in `CONFIG.impact.thresholds` decide the colours; the full derivation is on `method.html`.

---

## Assumptions and the parameters to tweak

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| A1 | Every spill-hour has equal weight (EDM gives duration, not volume) | — (structural) | Weight by permitted flow / storm-tank size if you can source it |
| A2 | Ongoing spills continue for 6 h beyond now | `thamesWater.assumedOngoingHours` | Longer in prolonged wet spells / groundwater-impacted sites |
| A3 | TW timestamps without an offset are UK clock time | `thamesWater.timesAreUtc` | Set `true` if comparison with the TW map shows a 1 h shift in BST |
| A4 | Offline monitors are ignored | `thamesWater.offlineWeight` | Set e.g. `0.3` for a precautionary view |
| A5 | Centreline is the OS Open Rivers main channel (1:25 000 nominal scale), simplified to 5 m; 341 km, tidal limit at 243 km | `river.geojsonUrl`, build options below (C1–C5) | Rebuild after OS updates; use OS MasterMap Water for finer detail |
| A6 | Overflows ≤25 km from the Thames reach it via their tributary | `river.snapMaxKm`, `river.receivingWaterFilter`, `hydraulics.tributaryVelocity`, `hydraulics.tributarySinuosity` | Tighten to focus on London; filter e.g. `['thames']` for direct outfalls only |
| A7 | Velocity from flow by a power law, v = 0.1·Q^0.34 (0.08–1.2 m/s) | `hydraulics.a`, `b`, `vMin`, `vMax`, `defaultFlowM3s` | Calibrate against a known travel time / EA velocity data |
| A8 | Tidal parcel excursion 14 km, net seaward drift 3 km/day, single M2 period, same phase everywhere | `tide.excursionKm`, `netSeawardKmPerDay`, `periodHours` | Drift is much larger at high fluvial flow; excursion shrinks toward Teddington |
| A9 | Tide phase from London Bridge high waters (ADMIRALTY predictions via the team's EasyTide service), else EA observed tidal level, else config | `tide.easyTideStationId` (0113), `tide.eaTidalSearch`, `tide.fallbackHighWaterUtc` | Use a station nearer your users (EasyTide ids in `THAMES_STATIONS`) |
| A10 | 90% die-off in 30 h | `decay.t90Hours` | Shorter in summer sun, longer in cold turbid winter water |
| A11 | Longitudinal dispersion 0.6 km²/h | `decay.dispersionKm2PerHour`, `decay.minSigmaKm` | Larger values = broader, flatter plumes |
| A12 | Spill chance = logistic in 6-h rain: 50% at 8 mm, none under 2 mm | `forecast.accumHours`, `r50mm`, `slopeMm`, `minRainMm`, `minProbability`, `siteBase`, `recentBoost` | Fit per site from EA detailed returns vs historical rain; **groundwater-impacted sites spill in dry weather**, so lower `minRainMm` for them |
| A13 | Spill propensity = percentile rank of each overflow's total spill hours over the last 365 days in `spill_event`, joined by **permit number** | `RIVER_PROPENSITY_DAYS`, `loadPropensity()` in `backend/src/services/riverInputs.service.js`, `forecast.siteBase` | Weight recent years more; use rain-conditional spill rates from the team's analysis endpoints |
| A14 | OSGB36→WGS84 via 7-parameter Helmert (~5 m) | `proj4.defs('EPSG:27700', …)` in `sources.js` | Load the OSTN15 NTv2 grid for sub-metre accuracy |

**Traffic light (`CONFIG.risk`, `shared/river/model/risk.js`)** — explained for users in methodology §2

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| R1 | Red if central ≥ 0.6 SH/km or ≥ 30% of runs reach high; amber if central ≥ 0.15 or ≥ 30% reach moderate; else green | `risk.probability`, `impact.thresholds` | 30% is precautionary; raise it for fewer amber/red days |
| R2 | A stretch takes the status of its riskiest point; the card names how far up/downstream it is | `stretchAt()` | Use the median point for a less cautious reading |
| R3 | A day's light = its worst hour (UK time) | `stretchDays()` | Use "hours in daylight" for swimmers |
| R4 | "Certainty" = share of runs agreeing there is (or isn't) sewage: High ≥ 70%, Medium ≥ 40% | `risk.confidence`; wording `risk.certaintyLabel` (e.g. 'Likelihood') | — |
| R5 | Advice text is general, not medical advice | `risk.levels.*.advice` | Align wording with local health/club guidance |
| R6 | Colour is never the only cue: ✓ ! ✕ symbols + text; status changes announced to screen readers only when they change | `risk.levels.*.icon` | — |

**Spots, sharing, spam (`CONFIG.spots`, `CONFIG.sightings`, `SETTINGS.recaptcha`)**

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| P1 | Place search covers the named riverside waypoints; full UK postcodes go to postcodes.io (no key) | `spots.postcodeLookup`, `THAMES_WAYPOINTS` | Add OS Open Names for every riverside place |
| P2 | Up to 12 favourites, stored only in this browser; the first opens automatically on return | `spots.maxFavourites`, `spots.storageKey` | Sync across devices would need accounts |
| P3 | Share links carry `lon`, `lat`, `r`, `name`; CSV is hourly from now to +7 days | `spotUrl()`, `outlookCsv()` | — |
| P4 | reCAPTCHA v3 score ≥ 0.5 and action `sighting` (and hostname if set); loaded only when the report form opens; tokens requested at submit (they expire after 2 min) | `RECAPTCHA_MIN_SCORE`, `RECAPTCHA_HOSTNAMES` | Raise if spam gets through; lower if real users are blocked |
| P5 | Over Google's free quota reCAPTCHA fails open, so the per-IP rate limit stays on | `SETTINGS.sightings.perIpPerHour` | — |

**WhatsApp status updates (`SETTINGS.alerts`)**: `downgradeHoldMinutes` (60, no flip-flopping), `minGapMinutes` (60, except rises to red), `warnAheadHours` (12, early-warning window), `quietHours` (22–07, only rises to red). Modes: `low` = every change + early warnings, `moderate` = every change, `high` = red only.

**Uncertainty ensemble (`CONFIG.uncertainty`)** — full explanation in methodology §5

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| U1 | 16 random runs + 1 central run give usable ranges; chances come in ~6% steps | `members` | More runs = smoother chances, slower (≈ linear); 32 is still fine in the worker |
| U2 | Spill strength per overflow is unknown: log-normal, σ = 0.7 (×/÷ 2) | `volumeSigma` | Narrow once overflows can be weighted by permitted flow or tank size |
| U3 | River speed ×/÷ 1.28, T90 ×/÷ 1.5, dispersion ×/÷ 1.65, net drift ×/÷ 1.65, excursion ± 15%, ongoing duration ×/÷ 1.65 | `velocitySigma`, `t90Sigma`, `dispersionSigma`, `netDriftSigma`, `excursionSd`, `ongoingSigma` | Judgement-based; calibrate against samples or dye tracing |
| U4 | Rain forecast error ×/÷ e^0.25 today, +0.1 per day ahead, shared by all overflows in a run | `rainSigmaDay0`, `rainSigmaPerDay` | Use Open-Meteo ensemble members instead for real forecast spread |
| U5 | Tide timing error ± 0.25 h (ADMIRALTY), ± 0.75 h (EA observed), ± 3 h (fallback) | `phaseSdHours` | — |
| U6 | Dispersion uses 7 age classes rather than each parcel's exact age | `ageClassesH` | More classes = closer to exact, slower |
| U7 | Runs use a seed fixed per hour so map and alerts agree | — (in `impact.js`) | — |
| U8 | "Chance on your stretch" = highest chance at any point on it (a lower bound on the joint probability) | `assessStretch()` | — |
| U9 | WhatsApp alerts fire on the highest level with ≥ 30% chance in the next 12 h | `SETTINGS.alerts.minChance`, `lookaheadHours` | Higher = fewer, surer alerts; also controls cost |

**Citizen sightings (`CONFIG.sightings`, `SETTINGS.sightings`)**

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| S1 | Sightings are unverified and NOT used by the model | — | Use them later to validate/calibrate the index |
| S2 | No personal data stored (no IP, name, contact); IP rate-limit (10/h) is in memory only | `perIpPerHour` | — |
| S3 | Reports must be within 5 km of the Thames and seen within the last 72 h; kept 90 days, shown 7 days | `maxOffRiverKm`, `maxAgeHours`, `retainDays`, `showDays` | — |
| S4 | Notes ≤ 280 characters, control characters and `<>` stripped; moderators hide (not delete) with `DELETE /api/sightings/:id` + `x-admin-token` | `maxNote`, `ADMIN_TOKEN` | Add photo uploads only with moderation in place |
| S5 | Serious pollution should still go to the EA hotline (0800 80 70 60, 24 h) — linked in the form | `officialPhone`, `officialReportUrl` | — |

**Live clock**: `live.tickSeconds` (30) sets how often the "now" position, label and chart line advance; `refresh.dischargeMinutes` (15) re-runs the data + model; `refresh.staleOnFocusMinutes` (5) refreshes when the tab regains focus.

**Centreline build (`scripts/build-thames-centreline.mjs`)**

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| C1 | The Thames = every link whose `name1` or `name2` is "River Thames" (378 links in 19 separate pieces) | `--name` | Build a tributary (e.g. `--name="River Wey"`) for tributary users |
| C2 | Pieces are joined by straight bridges ≤ 2 km between dead ends of *different* pieces (18 bridges, 7.7 km total, mostly the wide estuary below Erith) | `--gap` | Smaller values stop earlier in the estuary; the script reports unconnected pieces |
| C3 | Main channel = shortest route between the two most distant dead ends, so backwaters, mill streams and lock cuts are excluded | — (method) | Pick a specific channel by editing the network if you need a navigation channel |
| C4 | Network treated as undirected (some tidal links aren't digitised seaward); oriented so the end with no upstream link is the source | — | — |
| C5 | Douglas–Peucker simplification at 5 m (2,483 → 2,397 vertices) | `--tolerance` | Larger = smaller file, slightly shorter river; 5 m changes length by <0.1% |

Effect of switching from the waypoints: river distances grew by ~33% (e.g. Oxford overflow → Abingdon 7.8 km → 10.1 km), so modelled plumes now arrive later and further apart. Re-check `hydraulics.*` and `tide.excursionKm` if you had tuned them against the old line.

**WhatsApp alerts (`backend/src/config/river.js`)**

| # | Assumption | Parameter(s) | Why you might change it |
|---|---|---|---|
| W1 | Updates follow the stretch's traffic light (chosen spot ± radius); see the status-update settings above | `alerts.*` | — |
| W2 | Improvements must last 60 min before being announced; rises go immediately | `downgradeHoldMinutes` | Main lever on flip-flopping and cost |
| W3 | Overnight (22:00–07:00 UK) only rises to red are sent | `alerts.quietHours` | Early rowers may want 05:00 updates |
| W4 | "All clear" is now part of normal updates (red/amber → green) | — | — |
| W5 | Sign-up spot must be within 3 km of the Thames | `alerts.maxOffRiverKm` (+ `CONFIG.alerts.maxOffRiverKm` in the browser) | Tributary users (Wey, Lee) need a tributary model first |
| W6 | A bare `07…` number is a UK mobile | `normalisePhone()` in `backend/src/controllers/river.controller.js` | International users should type `+country` |
| W7 | Double opt-in proves number ownership; area changes on an active number only via WhatsApp location pin | `/api/subscribe` 409 rule | Stops someone else re-pointing your alerts |
| W8 | 5 sign-ups per IP per hour, 2 opt-in templates per number per day | `rateLimit.*` | Prevents the form being used to spam numbers |
| W9 | Graph API `v21.0` | `GRAPH_VERSION` env var | Meta retires versions; use the current one |
| W10 | The single "main source" named in an alert is the overflow with the most decayed weight within 10 km of the peak | `topSource()` in `backend/src/services/riverModel.service.js` | Name the top 2–3 for busy storm events |

Other knobs: `sim.pastHours` / `sim.horizonHours` (168 h = 7 days) / `sim.stepMinutes` / `sim.frameMinutes` (slider range and resolution), `forecast.forecastDays` (Open-Meteo, max 16), `river.sampleSpacingKm` (field resolution vs speed), `refresh.*` (polling), `impact.alertThreshold` (in-app alert), `map.*` (basemap, view, label layer for interleaving).

---

## Validation ideas (for the write-up)

- Compare predicted plume arrival with EA bathing-water samples at the designated river sites, or with community E. coli sampling.
- Back-test `forecast.*` on a past storm: rain from Open-Meteo's historical API vs observed starts in the EA detailed returns.
- Sensitivity: vary `t90Hours` (15–60 h) and `excursionKm` (8–20 km) and report how "your stretch" changes.

---

## Sources

Data
- ADMIRALTY EasyTide (tide predictions used through the team's tideForecast.service) — https://easytide.admiralty.co.uk
- Thames Water storm discharge data and third-party API — https://www.thameswater.co.uk/about-us/performance/river-health/storm-discharge-and-flow-data
- Thames Water v2 status endpoint — https://api.thameswater.co.uk/opendata/v2/discharge/status (via https://thames.me.uk/s00331sewage.php)
- Field names (v1 schema: `LocationName`, `PermitNumber`, `X`, `Y`, `AlertStatus`, …) — https://github.com/mossc001/Thames_Water_API_to_Home_Assistant
- EA Event Duration Monitoring – Storm Overflow – Start/Stop Detailed Data — https://www.data.gov.uk/dataset/event-duration-monitoring-storm-overflow-start-stop-detailed-data
- EA real-time flood-monitoring API reference — https://environment.data.gov.uk/flood-monitoring/doc/reference
- Open-Meteo forecast API & multi-location requests — https://open-meteo.com/en/docs , https://openmeteo.substack.com/p/weather-data-for-multiple-locations
- UKHO ADMIRALTY UK Tidal API (Discovery) — https://api.gov.uk/ukho/uk-tidal-api-discovery/ , https://www.admiralty.co.uk/access-data/apis ; endpoint shape from https://rdrr.io/github/simon-tarr/uk.tides/src/R/get_tides.R
- EPSG:27700 Helmert parameters — https://epsg.io/27700-1314 , https://github.com/OrdnanceSurvey/os-transform

Libraries
- deck.gl `@deck.gl/maplibre` MapLibreOverlay (Vite worker setup, `beforeId`, antialiasing) — https://deck.gl/docs/api-reference/maplibre/overview
- MapLibre GeolocateControl — https://maplibre.org/maplibre-gl-js/docs/API/classes/GeolocateControl/
- MDN Geolocation (secure context) — https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API

River network
- OS Open Rivers overview (topologically structured link-and-node network, flow direction, 1:25 000 nominal scale) — https://docs.os.uk/os-downloads/networks/os-open-rivers/os-open-rivers-overview
- OS Open Rivers on data.gov.uk (attribution statement, twice-yearly updates) — https://www.data.gov.uk/dataset/dc29160b-b163-4c6e-8817-f313229bcc23/os-open-rivers1
- OS Open Rivers technical specification — https://docs.os.uk/os-downloads/networks/os-open-rivers/os-open-rivers-technical-specification

Uncertainty, units and reporting
- E. coli die-off in river water (t99 ≈ 2–3 days at 15–25 °C, so T90 ≈ 24–36 h) — Dick et al. 2010, https://pmc.ncbi.nlm.nih.gov/articles/PMC2869114
- Inland bathing water standards (E. coli 500 / 1,000 / 900 cfu/100 ml) — Bathing Water Regulations 2013, Schedule 5, https://legislation.gov.uk/uksi/2013/1675/schedule/5/2016-06-20
- Open-Meteo forecast_days up to 16 — https://open-meteo.com/en/docs
- Reporting water pollution / EA 24-hour hotline 0800 80 70 60 — https://www.gov.uk/report-water-pollution
- reCAPTCHA v3 (execute with action, score 0.0–1.0, default threshold 0.5, tokens expire after 2 min) — https://developers.google.com/recaptcha/docs/v3 ; server verification — https://developers.google.com/recaptcha/docs/verify ; keys now in Google Cloud, siteverify unchanged, 10,000 free assessments/month, fails open over quota — https://docs.cloud.google.com/recaptcha/docs/migration-overview
- postcodes.io (no authentication) — https://api.postcodes.io/docs/overview

WhatsApp / server
- Cloud API template send request (endpoint, body) — https://ominiflow.com/blog/whatsapp-api-send-message
- Webhook verification, `X-Hub-Signature-256`, raw-body HMAC, de-duplication on `wamid`, HTTPS requirement — https://dev.to/wapgrowai_org/handling-whatsapp-cloud-api-webhooks-in-nodejs-signatures-retries-and-duplicate-events-4dci
- Templates, 24-hour window, opt-in, business approval — https://docs.developer.telekom.com/en/messages/concepts/whatsapp
- Per-message pricing from 1 July 2025; free utility templates inside the service window — https://help.zoho.com/portal/en/community/topic/whatsapp-pricing-changes-pay-per-message-starting-july-1-2025
- Meta Cloud API messages reference — https://developers.secure.facebook.com/docs/whatsapp/cloud-api/reference/messages

Next 24 hours
- PLA tide tables — average time differences on London Bridge (Tower Pier) — https://www.pla.co.uk/Safety/Tide-Tables-Average-Time-Differences (read via https://server1.pla.co.uk/Safety/Tide-Tables-Average-Time-Differences)
- AMS Glossary of Meteorology, "Rain" (light ≤ 0.25 cm/h, moderate 0.26–0.76 cm/h, heavy > 0.76 cm/h) — https://glossary.ametsoc.org/wiki/Rain

Clubs, layout and embedding
- postcodes.io place search (OS Open Names): https://api.postcodes.io/docs/place/query
- Photon geocoder (komoot; OSM data; search-as-you-type; fair-use public server): https://github.com/komoot/photon and API parameters https://github.com/komoot/photon/blob/master/docs/api-v1.md
- Active Thames (Tideway-funded programme run with the PLA; grants to river-activity groups, not a club directory) — https://tideway.london/impact/active-thames/ ; https://pla.co.uk/active-thames-awards-funding-26-organisations
- OpenStreetMap copyright and licence (ODbL; credit "© OpenStreetMap contributors") — https://www.openstreetmap.org/copyright ; OSMF attribution guidelines — https://osmfoundation.org/wiki/Attribution
- Overpass API language guide (`around` filter, regex on tags, `out center`) — https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide ; syntax reference (`around` with a list of points forms a line) — https://osm-queries.ldodds.com/syntax-reference.html
- CSP `frame-ancestors` (which sites may embed a page; supersedes X-Frame-Options) — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

Context
- Tidal Thames / Tideway — https://en.wikipedia.org/wiki/Tideway ; Thames Tideway Tunnel — https://www.tideway.london/

Attribution strings required by the data providers are in the panel footer (`frontend/live.html`).
