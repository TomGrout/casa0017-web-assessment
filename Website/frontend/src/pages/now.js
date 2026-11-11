/* global $ */

import { LONDON_BBOX, inLondon } from '../data/helpers.js'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

const GAUGE_MAX_MM = 30
const LIGHT_RAIN_MM = 4
const LOAD_ATTEMPTS = 3
const STALE_READING_MS = 90 * 60 * 1000

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let usualRain = null
let gaugeSeen = false

document.documentElement.classList.add('js')

const revealObserver = new IntersectionObserver(
  function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        revealObserver.unobserve(entry.target)
        if (entry.target.id === 'gauge-figure') {
          gaugeSeen = true
          showUsualRain()
        }
      }
    })
  },
  { threshold: 0.2 }
)

document.querySelectorAll('[data-reveal]').forEach(function (el) {
  revealObserver.observe(el)
})

const TIDE_CAPTIONS = {
  falling: '<strong>Falling tide.</strong> Carried out to the Thames.',
  rising: '<strong>Rising tide.</strong> Pushed back toward Stratford.',
}

function showUsualRain() {
  if (usualRain === null || !gaugeSeen) {
    return
  }

  const percent = Math.min(usualRain / GAUGE_MAX_MM, 1) * 100
  $('#gauge-fill').css('height', percent + '%')
  $('#usual-rain').removeClass('is-empty')

  if (reduceMotion) {
    $('#usual-rain').text(usualRain + ' mm')
    return
  }

  $({ value: 0 }).animate(
    { value: usualRain },
    {
      duration: 1600,
      step: function (now) {
        $('#usual-rain').text(now.toFixed(1) + ' mm')
      },
      complete: function () {
        $('#usual-rain').text(usualRain + ' mm')
      },
    }
  )
}

// The middle value: half of the numbers are lower and half are higher
function median(numbers) {
  const sorted = numbers.slice().sort(function (a, b) {
    return a - b
  })
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function showTide(tide) {
  $('#river').toggleClass('rising', tide === 'rising')

  $('.tide-button').attr('aria-pressed', 'false')
  $('.tide-button[data-tide="' + tide + '"]').attr('aria-pressed', 'true')

  $('#tide-caption').html(TIDE_CAPTIONS[tide])
}

$('.tide-button').on('click', function () {
  showTide($(this).data('tide'))
})

$('#last-updated').text('Loading live data…')

function showStatus(response) {
  const data = response.data

  if (data.rainfall && data.rainfall.count > 0) {
    $('#rain-now')
      .text(data.rainfall.total24hMm + ' mm')
      .removeClass('is-empty')
  }

  // The live feed covers the Thames and Lea well beyond London, so keep the London ones.
  // When Thames Water doesn't answer, the backend sends every outfall it has stored
  // instead, which isn't a live count, so leave the reading empty.
  const live = data.discharges.source === 'live'
  const outfalls = data.discharges.items.filter(function (outfall) {
    return outfall.lat && inLondon([Number(outfall.lng), Number(outfall.lat)])
  })
  if (live && outfalls.length > 0) {
    let spilling = 0
    $.each(outfalls, function (i, outfall) {
      if (outfall.isDischarging) {
        spilling = spilling + 1
      }
    })
    $('#spilling-now')
      .html(spilling + '<span class="reading-of"> of ' + outfalls.length + '</span>')
      .removeClass('is-empty')
  } else if (!live) {
    $('#live-message').text(
      "Thames Water's live feed didn't answer, so we can't show spills right now."
    )
  }

  // An old saved reading is not the tide right now, so only show a recent one
  const freshTide =
    data.tide &&
    data.tide.tidalPhase &&
    Date.now() - new Date(data.tide.timestamp).getTime() < STALE_READING_MS
  if (freshTide) {
    const tide = data.tide.tidalPhase === 'FLOOD' ? 'rising' : 'falling'
    $('#tide-now')
      .text(tide === 'rising' ? 'Rising' : 'Falling')
      .removeClass('is-empty')

    $('.tide-button[data-tide="' + tide + '"]').addClass('is-now')
    showTide(tide)
  }

  const time = new Date(response.timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  $('#last-updated').text('Live, updated ' + time)
}

function loadStatus(attempt) {
  $.getJSON(API_URL + '/status')
    .done(showStatus)
    .fail(function () {
      if (attempt < LOAD_ATTEMPTS) {
        setTimeout(function () {
          loadStatus(attempt + 1)
        }, 1500)
        return
      }
      $('#last-updated').text('Live data unavailable')
      $('#live-message').text(
        "Live readings aren't available right now. Try again in a few minutes."
      )
    })
}

loadStatus(1)

function showRainBeforeSpills(scatter, geojson) {
  const london = new Set()
  geojson.features.forEach(function (feature) {
    if (inLondon(feature.geometry.coordinates)) {
      london.add(feature.properties.permitNumber)
    }
  })

  const rain = []
  let firstStart = null
  scatter.data.forEach(function (row) {
    if (london.has(row.permitNumber)) {
      rain.push(Number(row.rain24h))
      if (firstStart === null || row.startTime < firstStart) {
        firstStart = row.startTime
      }
    }
  })

  if (rain.length === 0) {
    $('#usual-rain-text').text('No spills recorded yet. This fills in after the first one.')
    return
  }

  const light = rain.filter(function (mm) {
    return mm <= LIGHT_RAIN_MM
  }).length
  const since = new Date(firstStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  usualRain = Number(median(rain).toFixed(1))
  showUsualRain()

  $('#usual-rain-text').text(
    "Half of London's " +
      rain.length.toLocaleString('en-GB') +
      ' spills since ' +
      since +
      ' came after less rain than this. ' +
      Math.round((100 * light) / rain.length) +
      '% came after ' +
      LIGHT_RAIN_MM +
      ' mm or less.'
  )
}

// The online database sometimes drops a quiet connection, so try again before giving up
function loadSpills(attempt) {
  $.when(
    $.getJSON(API_URL + '/analysis/scatter?limit=20000&bbox=' + LONDON_BBOX),
    $.getJSON(API_URL + '/outfalls/geojson')
  )
    .done(function (scatterResponse, geojsonResponse) {
      showRainBeforeSpills(scatterResponse[0], geojsonResponse[0])
    })
    .fail(function () {
      if (attempt < LOAD_ATTEMPTS) {
        setTimeout(function () {
          loadSpills(attempt + 1)
        }, 1500)
      } else {
        $('#usual-rain-text').text(
          "We couldn't load the spill records. Try again in a few minutes."
        )
      }
    })
}

loadSpills(1)
