// =====================================================================
// Page: Triggers – "What sets them off?"  (triggers.html)
// =====================================================================
// The DESIGN is finished (triggers.html + src/triggers.css).
// This file is EMPTY on purpose: it is for whoever connects the data.
//
// Everything that needs data has an id in triggers.html, and a comment
// starting "DATA:" next to it that shows what should go there.
//
//   id                 what it is
//   -----------------  ------------------------------------------------
//   last-updated       time of the latest live update (top bar)
//   wet-only           "Wet catchment only" switch (checkbox)
//   outfall-select     outfall dropdown – add one <option> per outfall
//   scatter            the chart area – add one <div class="dot"> per spill
//   selection-box      shaded box – width follows the slider
//   selection-title    "12 spills after 4 mm of rain or less"
//   rain-slider        slider, 0–30 mm (default 4)
//   map-count          "6 of 38 outfalls"
//   map                box where the map goes
//   ranking-body       table body – add one <tr> per outfall
//   show-all           "See all outfalls" button
//   stat-number        big number, e.g. "0.5 mm"
//   stat-text          sentence under the big number
//   gauge-fill         the fill inside the rain-gauge tube (set its height)
//   clear-selection    "Clear selection" button
//
// Useful backend endpoints (Website/backend):
//   GET http://localhost:3000/api/outfalls    – outfalls (name, lat, lng, spilling now)
//   GET http://localhost:3000/api/events      – one row per spill (rain24hMm, durationHours)
//   GET http://localhost:3000/api/thresholds  – lowest rain before a spill, per outfall
// =====================================================================
