// =====================================================================
// Page: Overview  (index.html)
// =====================================================================
// Uses jQuery ($), which index.html loads just before this file.
// This file does 3 things:
//   1. Makes the "Falling tide / Rising tide" buttons work
//   2. Fills in the "Right now" row (rain, spills, tide)
//   3. Fills in the rain gauge in chapter 2 (least rain before a spill)
//
// If the backend isn't running, the numbers stay as "--" and a short
// message says so. The story on the page still works without it.
//
// Backend endpoints used (Website/backend):
//   GET http://localhost:3000/api/status      - rain, spills and tide right now
//   GET http://localhost:3000/api/thresholds  - lowest rain before a spill, per outfall
// =====================================================================

/* global $ */ // tells ESLint that $ is jQuery, loaded in index.html

// Where the backend runs (see Website/docker-compose.yml)
const API_URL = 'http://localhost:3000/api'

// The rain gauge is full at 30 mm (same scale as the dashboard chart)
const GAUGE_MAX_MM = 30

// The text under the river for each tide
const TIDE_CAPTIONS = {
  falling:
    '<strong>Falling tide.</strong> The creek drains into the Thames, so a spill is carried away from Stratford.',
  rising:
    '<strong>Rising tide.</strong> The Thames pushes up Bow Creek, so a spill is carried back toward Stratford.',
}

// ---------- 1. THE TIDE BUTTONS ----------
// tide is 'falling' or 'rising'
function showTide(tide) {
  // The class "rising" makes the dots in the river drift the other way (see the CSS)
  $('#river').toggleClass('rising', tide === 'rising')

  // aria-pressed tells screen readers which button is chosen, and the CSS colours it
  $('.tide-button').attr('aria-pressed', 'false')
  $('.tide-button[data-tide="' + tide + '"]').attr('aria-pressed', 'true')

  $('#tide-caption').html(TIDE_CAPTIONS[tide])
}

$('.tide-button').on('click', function () {
  showTide($(this).data('tide'))
})

// ---------- 2. "RIGHT NOW" READINGS ----------
$('#last-updated').text('Loading live data…')

$.getJSON(API_URL + '/status')
  .done(function (response) {
    const data = response.data

    // Rain: total of the last 24 hours at Walthamstow
    // removeClass('is-empty') turns the number from grey to blue (see .is-empty in the CSS)
    if (data.rainfall && data.rainfall.count > 0) {
      $('#rain-now').text(data.rainfall.total24hMm + ' mm').removeClass('is-empty')
    }

    // Spills: count the outfalls that are spilling now.
    // isDischarging is true/false (live) or 1/0 (from our database), so Number() turns both into 1/0
    const outfalls = data.discharges.items
    if (outfalls.length > 0) {
      let spilling = 0
      $.each(outfalls, function (i, outfall) {
        if (Number(outfall.isDischarging) === 1) {
          spilling = spilling + 1
        }
      })
      // e.g. "3 of 38". The "of 38" part is in a <span> so the CSS can make it smaller.
      $('#spilling-now')
        .html(spilling + '<span class="reading-of"> of ' + outfalls.length + '</span>')
        .removeClass('is-empty')
    }

    // Tide: FLOOD = rising, EBB = falling
    if (data.tide && data.tide.tidalPhase) {
      const tide = data.tide.tidalPhase === 'FLOOD' ? 'rising' : 'falling'
      $('#tide-now')
        .text(tide === 'rising' ? 'Rising' : 'Falling')
        .removeClass('is-empty')

      // Show the real tide in the chapter 3 figure, with a "now" tag on its button
      $('.tide-button[data-tide="' + tide + '"]').addClass('is-now')
      showTide(tide)
    }

    // Time the server fetched the data, e.g. "14:15"
    const time = new Date(response.timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
    $('#last-updated').text('Live, updated ' + time)
  })
  .fail(function () {
    $('#last-updated').text('Live data unavailable')
    $('#live-message').text(
      "Live readings aren't available right now. The rest of the page still works, so read on, or try again in a few minutes."
    )
  })

// ---------- 3. LEAST RAIN BEFORE A SPILL (chapter 2) ----------
// /api/thresholds gives one row per outfall, sorted with the lowest rain first
$.getJSON(API_URL + '/thresholds').done(function (response) {
  const outfalls = response.data

  if (outfalls.length === 0) {
    $('#lowest-rain-text').text(
      "We haven't recorded a spill yet. This number will appear after the first one."
    )
    return
  }

  const first = outfalls[0]
  const mm = Number(first.minRain24hMm)
  $('#lowest-rain').text(mm + ' mm')

  // Fill the gauge: 0 mm = empty, 30 mm or more = full
  const percent = Math.min(mm / GAUGE_MAX_MM, 1) * 100
  $('#gauge-fill').css('height', percent + '%')

  // Add up the spills from every outfall
  let totalSpills = 0
  $.each(outfalls, function (i, outfall) {
    totalSpills = totalSpills + Number(outfall.spillCount)
  })

  $('#lowest-rain-text').text(
    'Rain at Walthamstow in the 24 hours before a spill at ' +
      first.locationName +
      ', the lowest of the ' +
      totalSpills +
      ' spills we have recorded.'
  )
})
// If this request fails, the card keeps its "-- mm" and the message from part 2 explains why.
