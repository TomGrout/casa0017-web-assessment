/* global $ */

import { LONDON_BBOX, inLondon, tidyName } from '../data/helpers.js'
import { TIDE_START, TIDE_TYPES, TIDE_STEPS } from '../data/tides.js'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

const LOAD_ATTEMPTS = 3

// The Thames is tidal below Teddington Lock, which is at about this latitude
const TEDDINGTON_LAT = 51.44
const TUNNEL_DATE = Date.UTC(2025, 1, 14)

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const YEAR_MS = 365 * 24 * HOUR_MS
const MAX_TIDE_STEP_MIN = 540
const STALE_READING_MS = 90 * MINUTE_MS

const TOP_ROWS = 8
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th']

// The river sketch: distances along the Thames from Teddington, in km (rounded)
const STRIP_KM = 55
const PLACES = [
  ['Teddington', 0],
  ['Kew', 9, 'minor'],
  ['Putney', 17, 'mid'],
  ['Westminster', 27],
  ['Tower Bridge', 32, 'minor'],
  ['Greenwich', 39, 'mid'],
  ['Beckton', 51],
]
const RELEASE_KM = 17
const SWING_KM = 10
// About 100 km to the sea in roughly 90 days (summer) or 30 days (winter)
const DRIFT_KM_PER_DAY = { summer: 1.1, winter: 3.3 }
const JOURNEY = { summer: 'three months', winter: 'a month' }
const TIDE_HOURS = 12.42
const SKETCH_DAYS = 7
// Stop on a whole number of tides (about a week), so the swing has come back to zero
const SKETCH_HOURS = 14 * TIDE_HOURS
const SECONDS_PER_TIDE = 1.9
const PARTICLES = 14

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const sketch = { tide: 'rising', season: 'summer', frame: null, started: false, particles: [] }

let charts = null

document.documentElement.classList.add('js')

const turns = [TIDE_START * MINUTE_MS]
TIDE_STEPS.forEach(function (step) {
  turns.push(turns[turns.length - 1] + step * MINUTE_MS)
})

// Where a moment sits in the tide: rising or falling, and how far through (0 to 1)
function tideAt(time) {
  let low = 0
  let high = turns.length - 1
  if (time < turns[0] || time >= turns[high]) {
    return null
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (turns[middle] <= time) {
      low = middle
    } else {
      high = middle
    }
  }
  if (TIDE_STEPS[low] > MAX_TIDE_STEP_MIN) {
    return null
  }
  return {
    turn: low,
    rising: TIDE_TYPES[low] === 'L',
    part: (time - turns[low]) / (turns[high] - turns[low]),
  }
}

function isTidalThames(river, point) {
  return /River Thames/.test(river) && !/Tributary/.test(river) && point[1] >= TEDDINGTON_LAT
}

function monthKey(time) {
  const date = new Date(time)
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

function monthName(key, withYear) {
  const name = MONTHS[key % 12]
  return withYear ? name + ' ' + Math.floor(key / 12) : name
}

function percent(part, whole) {
  return whole === 0 ? 0 : Math.round((100 * part) / whole)
}

// Round the top of the scale up so the grid lines land on round numbers
function scaleFor(value) {
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(function (size) {
    return value / size <= 4
  })
  return { step: step, max: Math.max(step, Math.ceil(value / step) * step) }
}

// Writes one SVG tag as text, for example tag('line', { x1: 0, x2: 10 })
function tag(name, attributes, content) {
  let html = '<' + name
  $.each(attributes, function (key, value) {
    html += ' ' + key + '="' + value + '"'
  })
  return html + '>' + (content === undefined ? '' : content) + '</' + name + '>'
}

// A column with a rounded top and a square foot
function barPath(x, y, width, height) {
  const r = Math.min(4, height, width / 2)
  const right = x + width
  const leftSide = 'M' + x + ' ' + (y + height) + ' V' + (y + r)
  const leftCorner = ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y
  const rightCorner = ' Q' + right + ' ' + y + ' ' + right + ' ' + (y + r)
  return leftSide + leftCorner + ' H' + (right - r) + rightCorner + ' V' + (y + height) + ' Z'
}

function gridLines(box, scale) {
  const right = box.left + box.width
  let svg = ''
  for (let value = 0; value <= scale.max; value += scale.step) {
    const y = box.top + box.height - (value / scale.max) * box.height
    const kind = value === 0 ? 'axis' : 'grid'
    svg += tag('line', { class: kind, x1: box.left, x2: right, y1: y, y2: y })
    svg += tag('text', { x: box.left - 8, y: y + 4, 'text-anchor': 'end' }, value)
  }
  return svg
}

function column(box, slot, index, value, max, barClass, tip) {
  const slotWidth = box.width / slot.count
  const barWidth = Math.min(slot.bar, slotWidth - 2)
  const height = (value / max) * box.height
  const x = box.left + slotWidth * index
  const top = box.top + box.height - height
  const path = barPath(x + (slotWidth - barWidth) / 2, top, barWidth, height)
  const hit = tag('rect', { class: 'hit', x: x, y: box.top, width: slotWidth, height: box.height })
  const bar = tag('path', { class: 'bar ' + barClass, d: path })
  return tag('g', { class: 'col', 'data-tip': tip, 'data-top': top }, hit + bar)
}

// Charts are drawn at the width of their card, so the text is the same size on any screen
function chartBox(chart, top, height) {
  const width = Math.max(280, Math.round(chart.width()))
  return { left: 40, top: top, width: width - 48, height: height, full: width }
}

function showChart(chart, box, height, label, svg) {
  const viewBox = '0 0 ' + box.full + ' ' + height
  chart.html(
    tag('svg', { viewBox: viewBox, role: 'img', 'aria-label': label }, svg) +
      '<div class="tip" role="status"></div>'
  )
  // Wait a frame so the bars grow from the baseline
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      chart.addClass('is-drawn')
    })
  })
}

function drawCycleChart(bins) {
  const chart = $('#cycle-chart')
  const box = chartBox(chart, 30, 150)
  const scale = scaleFor(Math.max.apply(null, bins))
  const slot = { count: 12, bar: 24 }
  const peak = bins.indexOf(Math.max.apply(null, bins))
  const right = box.left + box.width
  const middle = box.left + box.width / 2
  const risingShare = percent(bins.slice(0, 6).reduce(sum, 0), bins.reduce(sum, 0))

  let svg = gridLines(box, scale)

  bins.forEach(function (value, i) {
    const tide = i < 6 ? 'rising' : 'falling'
    const tip = ORDINALS[i % 6] + ' hour of the ' + tide + ' tide: ' + value + ' spills'
    svg += column(box, slot, i, value, scale.max, 'bar-' + tide, tip)
  })

  const strong = { class: 'label-strong', 'text-anchor': 'middle' }
  const peakX = box.left + (box.width / 12) * (peak + 0.5)
  const peakY = box.top + box.height - (bins[peak] / scale.max) * box.height - 6
  svg += tag('text', $.extend({ x: peakX, y: peakY }, strong), bins[peak])
  svg += tag(
    'text',
    $.extend({ x: box.left + box.width / 4, y: 14 }, strong),
    'Rising tide, ' + risingShare + '%'
  )
  svg += tag(
    'text',
    $.extend({ x: box.left + (box.width * 3) / 4, y: 14 }, strong),
    'Falling tide, ' + (100 - risingShare) + '%'
  )

  // One tide drawn under the axis: low, up to high, back to low
  const low = box.top + box.height + 36
  const high = low - 24
  const bend = box.width * 0.21
  const rise = ' C' + (box.left + bend) + ' ' + low + ', ' + (middle - bend) + ' ' + high
  const fall = ' S' + (right - bend) + ' ' + low + ', ' + right + ' ' + low
  const curve = 'M' + box.left + ' ' + low + rise + ', ' + middle + ' ' + high + fall
  svg += tag('path', { class: 'tide-curve', d: curve })
  svg += tag('text', { x: box.left, y: low + 20 }, 'Low tide')
  svg += tag('text', { x: middle, y: low + 20, 'text-anchor': 'middle' }, 'High tide')
  svg += tag('text', { x: right, y: low + 20, 'text-anchor': 'end' }, 'Low tide')

  showChart(chart, box, 250, 'Column chart of when spills began within one tide', svg)
}

function drawMonthChart(chart, months, counts, options) {
  const box = chartBox(chart, options.top, options.height)
  const scale = scaleFor(Math.max.apply(null, counts))
  const slot = { count: months.length, bar: 14 }
  const slotWidth = box.width / months.length
  const narrow = box.full < 520
  const bottom = box.top + box.height

  let svg = gridLines(box, scale)

  months.forEach(function (key, i) {
    const tip = monthName(key, true) + ': ' + counts[i] + ' spills'
    svg += column(box, slot, i, counts[i], scale.max, options.barClass, tip)
    if (key % (narrow ? 12 : 6) === 0) {
      const x = box.left + slotWidth * (i + 0.5)
      const label = monthName(key, key % 12 === 0)
      svg += tag('text', { x: x, y: bottom + 18, 'text-anchor': 'middle' }, label)
    }
  })

  const tunnelMonth = months.indexOf(monthKey(TUNNEL_DATE))
  if (tunnelMonth >= 0) {
    const x = box.left + slotWidth * (tunnelMonth + 0.5)
    svg += tag('line', { class: 'marker', x1: x, x2: x, y1: box.top - 14, y2: bottom })
    if (options.note) {
      const note = narrow ? 'tunnel' : 'tunnel fully connected'
      svg += tag('text', { class: 'marker-note', x: x + 8, y: box.top - 2 }, note)
    }
  }

  showChart(chart, box, bottom + 26, options.label, svg)
}

function drawCharts() {
  if (!charts) {
    return
  }
  drawCycleChart(charts.bins)
  drawMonthChart($('#month-chart'), charts.months, charts.tidal, {
    top: 30,
    height: 150,
    barClass: 'bar-rising',
    note: true,
    label: 'Column chart of spills into the tidal Thames each month',
  })
  drawMonthChart($('#rest-chart'), charts.months, charts.rest, {
    top: 16,
    height: 80,
    barClass: 'bar-quiet',
    label: 'Column chart of spills across the rest of London each month',
  })
}

function sum(total, value) {
  return total + value
}

function countBetween(events, from, to) {
  return events.filter(function (event) {
    return event.start >= from && event.start < to
  }).length
}

function showBeforeAfter(prefix, events, note) {
  const before = countBetween(events, TUNNEL_DATE - YEAR_MS, TUNNEL_DATE)
  const after = countBetween(events, TUNNEL_DATE, TUNNEL_DATE + YEAR_MS)
  $('#' + prefix + '-before').text(before.toLocaleString('en-GB'))
  $('#' + prefix + '-after').text(after.toLocaleString('en-GB'))
  if (before > 0) {
    const change = percent(after - before, before)
    $('#' + prefix + '-change').text(
      (change <= 0 ? 'Down ' : 'Up ') + Math.abs(change) + '% ' + note
    )
  }
}

// Some sites have several overflow pipes, each with its own permit, so group them by place
function showOutfalls(tidal) {
  const rows = new Map()
  tidal.forEach(function (event) {
    const row = rows.get(event.site) || {
      name: event.name,
      spills: 0,
      timed: 0,
      rising: 0,
      before: 0,
      since: 0,
    }
    row.spills += 1
    if (event.tide) {
      row.timed += 1
      row.rising += event.tide.rising ? 1 : 0
    }
    if (event.start < TUNNEL_DATE) {
      row.before += 1
    } else {
      row.since += 1
    }
    rows.set(event.site, row)
  })

  const sorted = Array.from(rows.values()).sort(function (a, b) {
    return b.spills - a.spills
  })

  function draw(showAll) {
    const html = sorted.slice(0, showAll ? sorted.length : TOP_ROWS).map(function (row) {
      const share = percent(row.rising, row.timed)
      const bar =
        row.timed === 0
          ? '<span class="split-text">No tide data</span>'
          : '<span class="split-bar"><span class="part-rising" style="width:' +
            share +
            '%"></span>' +
            '<span class="part-falling" style="width:' +
            (100 - share) +
            '%"></span></span>' +
            '<span class="split-text">' +
            share +
            '% rising</span>'
      return (
        '<tr><td>' +
        row.name +
        '</td><td>' +
        row.spills +
        '</td><td>' +
        bar +
        '</td><td>' +
        row.before +
        '</td><td>' +
        row.since +
        '</td></tr>'
      )
    })
    $('#outfall-rows').html(html.join(''))
    $('#show-all')
      .prop('hidden', sorted.length <= TOP_ROWS)
      .text(showAll ? 'Show the busiest ' + TOP_ROWS : 'See all ' + sorted.length + ' outfalls')
      .off('click')
      .on('click', function () {
        draw(!showAll)
      })
  }

  draw(false)
  return sorted.length
}

function showData(scatter, geojson) {
  const outfalls = new Map()
  geojson.features.forEach(function (feature) {
    const point = feature.geometry.coordinates
    if (inLondon(point)) {
      const name = tidyName(feature.properties.locationName)
      outfalls.set(feature.properties.permitNumber, {
        name: name,
        site: name.toUpperCase() + '|' + point[0].toFixed(4) + ',' + point[1].toFixed(4),
        tidal: isTidalThames(feature.properties.river || '', point),
      })
    }
  })

  const tidal = []
  const rest = []
  scatter.data.forEach(function (row) {
    const outfall = outfalls.get(row.permitNumber)
    if (!outfall) {
      return
    }
    const start = new Date(row.startTime).getTime()
    const event = {
      site: outfall.site,
      name: outfall.name,
      start: start,
      end: start + Number(row.durationHours) * HOUR_MS,
    }
    if (outfall.tidal) {
      event.tide = tideAt(start)
      tidal.push(event)
    } else {
      rest.push(event)
    }
  })

  if (tidal.length === 0) {
    showError()
    return
  }

  const timed = tidal.filter(function (event) {
    return event.tide
  })
  const bins = Array(12).fill(0)
  let rising = 0
  let turned = 0
  timed.forEach(function (event) {
    const sixth = Math.min(5, Math.floor(event.tide.part * 6))
    bins[(event.tide.rising ? 0 : 6) + sixth] += 1
    rising += event.tide.rising ? 1 : 0
    const end = tideAt(event.end)
    if (end && end.turn !== event.tide.turn) {
      turned += 1
    }
  })

  $('#rising-share')
    .text(percent(rising, timed.length) + '%')
    .removeClass('is-empty')
  $('#turned-text').text(
    Math.round((10 * turned) / timed.length) +
      ' in 10 were still going when the tide turned, so they were carried both ways.'
  )

  const outfallCount = showOutfalls(tidal)

  const starts = tidal.map(function (event) {
    return event.start
  })
  const first = Math.min.apply(null, starts)
  const last = Math.max.apply(null, starts)
  const period = monthName(monthKey(first), true) + ' to ' + monthName(monthKey(last), true)
  const untimed = tidal.length - timed.length
  let caption = timed.length.toLocaleString('en-GB') + ' spills from ' + outfallCount
  caption += ' outfalls, ' + period + ', placed on one tide.'
  if (untimed > 0) {
    caption += ' ' + untimed + ' more are left out because we have no tide data for those days.'
  }
  $('#cycle-caption').text(caption)

  const months = []
  for (let key = monthKey(first); key <= monthKey(last); key++) {
    months.push(key)
  }
  function perMonth(events) {
    const counts = months.map(function () {
      return 0
    })
    events.forEach(function (event) {
      const index = monthKey(event.start) - months[0]
      if (index >= 0 && index < counts.length) {
        counts[index] += 1
      }
    })
    return counts
  }

  charts = { bins: bins, months: months, tidal: perMonth(tidal), rest: perMonth(rest) }
  drawCharts()

  let cycleRows = '<tr><th>Part of the tide</th><th>Spills that began</th></tr>'
  bins.forEach(function (value, i) {
    const part = ORDINALS[i % 6] + ' hour, ' + (i < 6 ? 'rising' : 'falling')
    cycleRows += '<tr><td>' + part + '</td><td>' + value + '</td></tr>'
  })
  $('#cycle-table').html(cycleRows)

  let monthRows = '<tr><th>Month</th><th>Tidal Thames</th><th>Rest of London</th></tr>'
  months.forEach(function (key, i) {
    monthRows += '<tr><td>' + monthName(key, true) + '</td><td>' + charts.tidal[i]
    monthRows += '</td><td>' + charts.rest[i] + '</td></tr>'
  })
  $('#month-table').html(monthRows)

  showBeforeAfter('thames', tidal, 'from the year before the tunnel to the year after')
  showBeforeAfter('rest', rest, 'over the same two years, with no tunnel')
}

function showError() {
  const message = "We couldn't load the spill records. Try again in a few minutes."
  $('#cycle-chart, #month-chart').html('<p class="empty-message">' + message + '</p>')
  $('#outfall-rows').html('<tr><td colspan="5" class="empty-message">' + message + '</td></tr>')
}

// The online database sometimes drops a quiet connection, so try again before giving up
function loadData(attempt) {
  $.when(
    $.getJSON(API_URL + '/analysis/scatter?limit=20000&bbox=' + LONDON_BBOX),
    $.getJSON(API_URL + '/outfalls/geojson')
  )
    .done(function (scatterResponse, geojsonResponse) {
      showData(scatterResponse[0], geojsonResponse[0])
    })
    .fail(function () {
      if (attempt < LOAD_ATTEMPTS) {
        setTimeout(function () {
          loadData(attempt + 1)
        }, 1500)
      } else {
        showError()
      }
    })
}

function showTideNow(tide) {
  const rising = tide.tidalPhase === 'FLOOD'
  const read = new Date(tide.timestamp)
  const stale = Date.now() - read.getTime() > STALE_READING_MS
  const time = read.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = read.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

  $('#tide-arrow').addClass(rising ? 'rising' : 'falling')
  $('#tide-state')
    .text(rising ? 'Rising' : 'Falling')
    .removeClass('is-empty')

  if (stale) {
    $('#tide-text').text("The gauge hasn't reported for a while, so this is its last reading.")
    $('#tide-meta').text('Silvertown gauge, ' + day + ', ' + time)
    $('#last-updated').text('Last tide reading ' + day)
    return
  }

  $('#tide-text').text(
    rising
      ? 'A spill into the Thames now would be carried upstream first.'
      : 'A spill into the Thames now would be carried toward the sea, until the tide turns.'
  )
  $('#tide-meta').text('Silvertown gauge, ' + time)
  $('#last-updated').text('Live, updated ' + time)

  const now = rising ? 'rising' : 'falling'
  $('.choice-button[data-tide="' + now + '"]').addClass('is-now')
  if (!sketch.started) {
    chooseTide(now)
  }
}

function showTideError() {
  $('#tide-text').text("We can't reach the tide gauge right now. Try again in a few minutes.")
  $('#last-updated').text('Live data unavailable')
}

function chooseTide(tide) {
  sketch.tide = tide
  $('.choice-button[data-tide]').attr('aria-pressed', 'false')
  $('.choice-button[data-tide="' + tide + '"]').attr('aria-pressed', 'true')
}

function chooseSeason(season) {
  sketch.season = season
  $('.choice-button[data-season]').attr('aria-pressed', 'false')
  $('.choice-button[data-season="' + season + '"]').attr('aria-pressed', 'true')
}

function buildSketch() {
  PLACES.forEach(function (place) {
    $('<span class="place">')
      .text(place[0])
      .addClass(place[2] || '')
      .css('left', (100 * place[1]) / STRIP_KM + '%')
      .appendTo('#places')
  })
  $('#outfall-pipe').css('left', (100 * RELEASE_KM) / STRIP_KM + '%')

  for (let i = 0; i < PARTICLES; i++) {
    // Each dot swings and drifts a little differently, so the spill spreads out
    sketch.particles.push({
      element: $('<span class="particle">').appendTo('#thames-water')[0],
      lane: 0.3 + 0.5 * Math.random(),
      swing: 0.7 + 0.45 * Math.random(),
      pace: 0.5 + Math.random(),
    })
  }
}

// Where one dot is after some hours: swung by the tide, plus a slow drift to the sea
function positionKm(particle, hours) {
  const turn = (1 - Math.cos((2 * Math.PI * hours) / TIDE_HOURS)) / 2
  const swing = SWING_KM * turn * particle.swing * (sketch.tide === 'rising' ? -1 : 1)
  const drift = (DRIFT_KM_PER_DAY[sketch.season] / 24) * hours * particle.pace
  return Math.max(0.5, RELEASE_KM + swing + drift)
}

function tideComingIn(hours) {
  const firstHalf = Math.sin((2 * Math.PI * hours) / TIDE_HOURS) >= 0
  return sketch.tide === 'rising' ? firstHalf : !firstHalf
}

function drawSketch(hours, reach) {
  const water = $('#thames-water')
  const width = water.width()
  const height = water.height()
  let total = 0

  sketch.particles.forEach(function (particle) {
    const km = positionKm(particle, hours)
    total += km
    reach.min = Math.min(reach.min, km)
    reach.max = Math.max(reach.max, km)
    particle.element.style.transform =
      'translate(' + (km / STRIP_KM) * width + 'px, ' + particle.lane * height + 'px)'
  })

  $('#reach').css(
    'transform',
    'translateX(' +
      (reach.min / STRIP_KM) * width +
      'px) scaleX(' +
      (reach.max - reach.min) / STRIP_KM +
      ')'
  )
  return total / sketch.particles.length
}

function nearestPlace(km) {
  return PLACES.reduce(function (best, place) {
    return Math.abs(place[1] - km) < Math.abs(best[1] - km) ? place : best
  })[0]
}

function finishSketch(reach) {
  const mean = drawSketch(SKETCH_HOURS, reach)
  const moved = Math.round(mean - RELEASE_KM)
  $('#thames-water').removeClass('is-rising')
  $('#flow-note').text('')
  $('#day-count').text('Day ' + SKETCH_DAYS + '.')
  $('#day-text').text(
    'A week on, it has drifted about ' +
      moved +
      ' km toward the sea and is near ' +
      nearestPlace(mean) +
      '. In ' +
      sketch.season +
      ' the whole trip from Teddington to the sea takes about ' +
      JOURNEY[sketch.season] +
      '.'
  )
  $('#release').text('Release another')
  sketch.frame = null
}

function release() {
  cancelAnimationFrame(sketch.frame)
  sketch.started = true

  const reach = { min: RELEASE_KM, max: RELEASE_KM }
  $('.particle, #reach').addClass('is-on')

  if (reduceMotion) {
    for (let hours = 0; hours <= SKETCH_HOURS; hours += 0.5) {
      sketch.particles.forEach(function (particle) {
        const km = positionKm(particle, hours)
        reach.min = Math.min(reach.min, km)
        reach.max = Math.max(reach.max, km)
      })
    }
    finishSketch(reach)
    return
  }

  const began = performance.now()
  let waves = 0
  let lastTime = began
  let shown = ''

  function step(now) {
    const hours = ((now - began) / 1000 / SECONDS_PER_TIDE) * TIDE_HOURS
    if (hours >= SKETCH_HOURS) {
      finishSketch(reach)
      return
    }

    drawSketch(hours, reach)

    const comingIn = tideComingIn(hours)
    const speed = Math.abs(Math.sin((2 * Math.PI * hours) / TIDE_HOURS))
    waves += (comingIn ? -1 : 1) * speed * (now - lastTime) * 0.06
    lastTime = now
    $('#thames-water').css('background-position', waves + 'px 30px, ' + waves * 0.6 + 'px 82px')

    const day = Math.min(SKETCH_DAYS, Math.floor(hours / 24) + 1)
    const state = day + (comingIn ? 'in' : 'out')
    if (state !== shown) {
      shown = state
      $('#thames-water').toggleClass('is-rising', comingIn)
      $('#flow-note').text(comingIn ? '← tide coming in' : 'tide going out →')
      $('#day-count').text('Day ' + day + '.')
      $('#day-text').text(
        comingIn
          ? 'The tide is coming in, carrying it back upstream.'
          : 'The tide is going out, carrying it toward the sea.'
      )
    }

    sketch.frame = requestAnimationFrame(step)
  }

  $('#release').text('Release another')
  sketch.frame = requestAnimationFrame(step)
}

const revealObserver = new IntersectionObserver(
  function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        revealObserver.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.2 }
)

document.querySelectorAll('[data-reveal]').forEach(function (element) {
  revealObserver.observe(element)
})

// Release the first spill once the river is properly in view
const sketchObserver = new IntersectionObserver(
  function (entries) {
    if (entries[0].isIntersecting) {
      sketchObserver.disconnect()
      if (!sketch.started && !reduceMotion) {
        release()
      }
    }
  },
  { threshold: 0.9 }
)
sketchObserver.observe(document.getElementById('thames'))

let resizeTimer = null
let lastWidth = window.innerWidth
window.addEventListener('resize', function () {
  if (window.innerWidth === lastWidth) {
    return
  }
  lastWidth = window.innerWidth
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(drawCharts, 150)
})

$('.choice-button[data-tide]').on('click', function () {
  chooseTide($(this).data('tide'))
  release()
})

$('.choice-button[data-season]').on('click', function () {
  chooseSeason($(this).data('season'))
  release()
})

$('#release').on('click', release)

$('.chart').on('mouseenter click', '.col', function () {
  const chart = $(this).closest('.chart')
  const svg = chart.find('svg')[0]
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
  const hit = $(this).find('.hit')
  chart.find('.col').removeClass('is-hover')
  $(this).addClass('is-hover')
  chart
    .find('.tip')
    .text($(this).data('tip'))
    .css({
      left: (Number(hit.attr('x')) + Number(hit.attr('width')) / 2) * scale,
      top: Number($(this).data('top')) * scale,
    })
    .addClass('is-on')
})

$('.chart').on('mouseleave', '.col', function () {
  $(this).removeClass('is-hover')
  $(this).closest('.chart').find('.tip').removeClass('is-on')
})

buildSketch()

$('#last-updated').text('Loading live data…')

// When the gauge service is slow, the backend sends its last saved reading instead,
// which can be days old, so try again a couple of times before showing that
function loadTide(attempt) {
  $.getJSON(API_URL + '/tide')
    .done(function (response) {
      const tide = response.data
      if (!tide || !tide.tidalPhase) {
        showTideError()
        return
      }
      const stale = Date.now() - new Date(tide.timestamp).getTime() > STALE_READING_MS
      if (stale && attempt < LOAD_ATTEMPTS) {
        setTimeout(function () {
          loadTide(attempt + 1)
        }, 2000)
        return
      }
      showTideNow(tide)
    })
    .fail(function () {
      if (attempt < LOAD_ATTEMPTS) {
        setTimeout(function () {
          loadTide(attempt + 1)
        }, 2000)
      } else {
        showTideError()
      }
    })
}

loadTide(1)

loadData(1)
