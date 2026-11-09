/* global $, maplibregl */

import { LONDON_BOUNDARY, LEA_CATCHMENT } from '../data/london.js'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

const LONDON_BBOX = '-0.52,51.28,0.35,51.70'
const EDGE_TOLERANCE_M = 250

const RIVER_NAMES = { lea: 'River Lea', thames: 'Thames and others' }
const ALL_OUTFALLS = {
  all: 'All London outfalls',
  lea: 'All River Lea outfalls',
  thames: 'All Thames and other outfalls',
}
const LEA_LABEL = /\bRiver (Lea|Lee)\b|Bow Creek/i

const RAIN_MAX_MM = 30
const HOURS_MAX = 20
const DEFAULT_RAIN_MM = 4
const WET_PRIOR_MM = 2
const TOP_ROWS = 5

const state = {
  events: [],
  outfalls: new Map(),
  river: 'all',
  wetOnly: false,
  outfall: 'all',
  maxRain: DEFAULT_RAIN_MM,
  showAll: false,
}

let map = null
let points = []

function formatMm(mm) {
  if (mm > 0 && mm < 0.05) {
    return 'under 0.1 mm'
  }
  return Number(mm.toFixed(1)) + ' mm'
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's')
}

function insidePolygon(point, polygon) {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[i]
    const [x2, y2] = polygon[j]
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside
    }
  }
  return inside
}

function metresToEdge(point, polygon) {
  const kx = 111320 * Math.cos((51.5 * Math.PI) / 180)
  const ky = 110540
  const px = point[0] * kx
  const py = point[1] * ky
  let best = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j][0] * kx
    const ay = polygon[j][1] * ky
    const dx = polygon[i][0] * kx - ax
    const dy = polygon[i][1] * ky - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy))
  }
  return best
}

// The boundary is clipped to the river bank, so outfalls on the Thames sit just outside it
function inLondon(point) {
  return (
    insidePolygon(point, LONDON_BOUNDARY) || metresToEdge(point, LONDON_BOUNDARY) < EDGE_TOLERANCE_M
  )
}

// Most outfalls are labelled "Unknown", so fall back on where they are
function riverOf(label, point) {
  if (LEA_LABEL.test(label)) {
    return 'lea'
  }
  if (/thames/i.test(label)) {
    return 'thames'
  }
  return insidePolygon(point, LEA_CATCHMENT) ? 'lea' : 'thames'
}

function filteredEvents() {
  return state.events.filter(function (e) {
    if (state.river !== 'all' && e.river !== state.river) {
      return false
    }
    if (state.wetOnly && !(e.priorRain >= WET_PRIOR_MM)) {
      return false
    }
    return state.outfall === 'all' || e.permit === state.outfall
  })
}

function isSelected(e) {
  return state.maxRain >= RAIN_MAX_MM || e.rain24h <= state.maxRain
}

function summarise(events) {
  const byOutfall = new Map()
  events.forEach(function (e) {
    const row = byOutfall.get(e.permit) || {
      permit: e.permit,
      name: e.name,
      river: e.river,
      spills: 0,
      selected: 0,
      lowestRain: Infinity,
    }
    row.spills = row.spills + 1
    row.selected = row.selected + (isSelected(e) ? 1 : 0)
    row.lowestRain = Math.min(row.lowestRain, e.rain24h)
    byOutfall.set(e.permit, row)
  })
  return byOutfall
}

function drawScatter() {
  const canvas = document.getElementById('scatter-canvas')
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const ratio = window.devicePixelRatio || 1
  canvas.width = width * ratio
  canvas.height = height * ratio

  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  ctx.clearRect(0, 0, width, height)

  const xy = function (e) {
    return [
      Math.min(e.rain24h / RAIN_MAX_MM, 1) * width,
      height - Math.min(e.hours / HOURS_MAX, 1) * height,
    ]
  }

  ctx.fillStyle = 'rgba(160, 172, 184, 0.45)'
  points.forEach(function (e) {
    if (!isSelected(e)) {
      const [x, y] = xy(e)
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  ctx.fillStyle = '#e9a23b'
  ctx.strokeStyle = 'rgba(58, 42, 16, 0.7)'
  ctx.lineWidth = 1
  points.forEach(function (e) {
    if (isSelected(e)) {
      const [x, y] = xy(e)
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  })
}

function updateSelection(events) {
  drawScatter()

  const width = (state.maxRain / RAIN_MAX_MM) * 100
  $('#selection-box')
    .css('width', width + '%')
    .toggleClass('flip', width > 60)

  const selected = events.filter(isSelected)
  $('#selection-title').text(
    state.maxRain >= RAIN_MAX_MM
      ? 'All ' + plural(selected.length, 'spill')
      : plural(selected.length, 'spill') + ' after ' + formatMm(state.maxRain) + ' of rain or less'
  )
  $('#scatter').attr(
    'aria-label',
    'Scatter chart of ' +
      plural(events.length, 'spill') +
      ', rain before each spill against how long it lasted. ' +
      selected.length +
      ' fall inside your selection.'
  )
}

function updateMap(byOutfall) {
  let withSelected = 0
  byOutfall.forEach(function (row) {
    withSelected = withSelected + (row.selected > 0 ? 1 : 0)
  })
  $('#map-count').text(withSelected + ' of ' + plural(byOutfall.size, 'outfall'))

  if (!map || !map.getSource('outfalls')) {
    return
  }

  const features = []
  state.outfalls.forEach(function (o) {
    if (state.river !== 'all' && o.river !== state.river) {
      return
    }
    const row = byOutfall.get(o.permit)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: o.coordinates },
      properties: {
        name: o.name,
        spilling: o.isDischarging,
        spills: row ? row.spills : 0,
        selected: row ? row.selected : 0,
        lowestRain: row ? row.lowestRain : null,
      },
    })
  })
  map.getSource('outfalls').setData({ type: 'FeatureCollection', features: features })
}

function rankOutfalls(byOutfall) {
  return Array.from(byOutfall.values()).sort(function (a, b) {
    return a.lowestRain - b.lowestRain || b.spills - a.spills
  })
}

function updateRanking(byOutfall) {
  const rows = rankOutfalls(byOutfall)

  const $body = $('#ranking-body').empty()
  if (rows.length === 0) {
    $body.append(
      $('<tr>').append(
        $('<td colspan="6" class="empty-message">').text('No spills match these filters.')
      )
    )
  }

  const shown = state.showAll ? rows : rows.slice(0, TOP_ROWS)
  shown.forEach(function (row, i) {
    const outfall = state.outfalls.get(row.permit)
    const spilling = outfall ? outfall.isDischarging : false
    const barWidth = Math.min(row.lowestRain / RAIN_MAX_MM, 1) * 100

    $('<tr>')
      .toggleClass('top-row', i === 0)
      .append($('<td>').text(i + 1))
      .append($('<td>').text(row.name))
      .append($('<td>').text(RIVER_NAMES[row.river]))
      .append(
        $('<td>')
          .text(formatMm(row.lowestRain))
          .append(
            $('<span class="bar"><span class="bar-fill"></span></span>')
              .find('.bar-fill')
              .css('width', barWidth + '%')
              .end()
          )
      )
      .append($('<td>').text(row.spills))
      .append(
        $('<td>').append(
          $('<span class="badge">')
            .addClass(spilling ? 'badge-spilling' : 'badge-ok')
            .text(spilling ? 'Spilling now' : 'Not spilling')
        )
      )
      .appendTo($body)
  })

  $('#show-all')
    .toggle(rows.length > TOP_ROWS)
    .text(state.showAll ? 'Show top ' + TOP_ROWS : 'See all ' + rows.length + ' outfalls')
}

function updateStat(events, byOutfall) {
  if (events.length === 0) {
    $('#stat-number').text('-- mm').addClass('is-empty')
    $('#gauge-fill').css('height', 0)
    $('#stat-text').text('No spills match these filters.')
    return
  }

  const top = rankOutfalls(byOutfall)[0]
  const lowest = events
    .filter(function (e) {
      return e.permit === top.permit && e.rain24h === top.lowestRain
    })
    .reduce(function (a, b) {
      return b.start > a.start ? b : a
    })
  const selected = events.filter(isSelected)
  let outfallsInSelection = 0
  byOutfall.forEach(function (row) {
    outfallsInSelection = outfallsInSelection + (row.selected > 0 ? 1 : 0)
  })

  $('#stat-number').text(formatMm(lowest.rain24h)).removeClass('is-empty')
  $('#gauge-fill').css('height', Math.min(lowest.rain24h / RAIN_MAX_MM, 1) * 100 + '%')
  $('#stat-text').text(
    'At ' +
      lowest.name +
      ', ' +
      formatDate(lowest.start) +
      '. Your selection holds ' +
      plural(selected.length, 'spill') +
      ' from ' +
      plural(outfallsInSelection, 'outfall') +
      '.'
  )
}

function render(newFilters) {
  const events = filteredEvents()
  const byOutfall = summarise(events)

  if (newFilters) {
    points = events
  }

  $('#scatter .empty-message')
    .text(state.events.length === 0 ? 'No spills recorded yet.' : 'No spills match these filters.')
    .toggle(events.length === 0)

  updateSelection(events)
  updateMap(byOutfall)
  updateRanking(byOutfall)
  updateStat(events, byOutfall)
}

function fillOutfallSelect() {
  const named = new Map()
  state.events.forEach(function (e) {
    if (state.river === 'all' || e.river === state.river) {
      named.set(e.permit, e.name)
    }
  })

  const $select = $('#outfall-select')
  $select.find('option:not([value="all"])').remove()
  $select.find('option[value="all"]').text(ALL_OUTFALLS[state.river])

  Array.from(named.entries())
    .sort(function (a, b) {
      return a[1].localeCompare(b[1])
    })
    .forEach(function (entry) {
      $('<option>').val(entry[0]).text(entry[1]).appendTo($select)
    })
}

function visibleBounds() {
  const withSpills = new Set(
    filteredEvents().map(function (e) {
      return e.permit
    })
  )
  const bounds = new maplibregl.LngLatBounds()
  state.outfalls.forEach(function (o) {
    if (withSpills.has(o.permit)) {
      bounds.extend(o.coordinates)
    }
  })
  return bounds
}

function fitMap() {
  if (!map) {
    return
  }
  const bounds = visibleBounds()
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: 40,
      maxZoom: 13,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600,
    })
  }
}

function startMap() {
  if (typeof maplibregl === 'undefined') {
    $('#map').addClass('map-error').text("The map couldn't load.")
    return
  }

  const bounds = visibleBounds()

  try {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      bounds: bounds.isEmpty() ? [-0.51, 51.29, 0.33, 51.69] : bounds,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      cooperativeGestures: true,
    })
  } catch {
    $('#map').addClass('map-error').text("The map couldn't load.")
    return
  }

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('load', function () {
    map.addSource('outfalls', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    map.addLayer({
      id: 'outfalls-quiet',
      type: 'circle',
      source: 'outfalls',
      filter: ['==', ['get', 'selected'], 0],
      paint: {
        'circle-radius': ['case', ['>', ['get', 'spills'], 0], 4, 2.5],
        'circle-color': '#a0acb8',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    })

    map.addLayer({
      id: 'outfalls-selected',
      type: 'circle',
      source: 'outfalls',
      filter: ['>', ['get', 'selected'], 0],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'selected'], 1, 4, 50, 12],
        'circle-color': '#e9a23b',
        'circle-stroke-color': '#3a2a10',
        'circle-stroke-width': 1,
      },
    })

    map.addLayer({
      id: 'outfalls-spilling',
      type: 'circle',
      source: 'outfalls',
      filter: ['==', ['get', 'spilling'], true],
      paint: {
        'circle-radius': 10,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#0f1f33',
        'circle-stroke-width': 2,
      },
    })

    render(false)

    const popup = new maplibregl.Popup({ closeButton: false, offset: 10 })
    ;['outfalls-quiet', 'outfalls-selected'].forEach(function (layer) {
      map.on('mouseenter', layer, function (e) {
        map.getCanvas().style.cursor = 'pointer'
        const p = e.features[0].properties
        const lines = [$('<strong>').text(p.name)]
        if (p.spills > 0) {
          lines.push(
            $('<span>').text(p.selected + ' of ' + plural(p.spills, 'spill') + ' selected')
          )
          lines.push($('<span>').text('Lowest rain: ' + formatMm(Number(p.lowestRain))))
        } else {
          lines.push($('<span>').text('No spills for these filters'))
        }
        if (p.spilling) {
          lines.push($('<span class="popup-spilling">').text('Spilling now'))
        }
        popup
          .setLngLat(e.features[0].geometry.coordinates)
          .setDOMContent($('<div class="popup">').append(lines)[0])
          .addTo(map)
      })
      map.on('mouseleave', layer, function () {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
    })
  })
}

$('#rain-slider').on('input', function () {
  state.maxRain = Number(this.value)
  render(false)
})

$('#river-select').on('change', function () {
  state.river = this.value
  state.outfall = 'all'
  fillOutfallSelect()
  render(true)
  fitMap()
})

$('#wet-only').on('change', function () {
  state.wetOnly = this.checked
  render(true)
})

$('#outfall-select').on('change', function () {
  state.outfall = this.value
  render(true)
  fitMap()
})

$('#show-all').on('click', function () {
  state.showAll = !state.showAll
  render(false)
})

$('#clear-selection').on('click', function () {
  state.river = 'all'
  state.wetOnly = false
  state.outfall = 'all'
  state.maxRain = DEFAULT_RAIN_MM
  state.showAll = false
  $('#river-select').val('all')
  $('#wet-only').prop('checked', false)
  $('#rain-slider').val(DEFAULT_RAIN_MM)
  fillOutfallSelect()
  $('#outfall-select').val('all')
  render(true)
  fitMap()
})

new ResizeObserver(drawScatter).observe(document.getElementById('scatter-canvas'))

$('#last-updated').text('Loading live data…')

$.when(
  $.getJSON(API_URL + '/analysis/scatter?limit=20000&bbox=' + LONDON_BBOX),
  $.getJSON(API_URL + '/outfalls/geojson')
)
  .done(function (scatterResponse, geojsonResponse) {
    geojsonResponse[0].features.forEach(function (f) {
      const point = f.geometry.coordinates
      if (!inLondon(point)) {
        return
      }
      state.outfalls.set(f.properties.permitNumber, {
        permit: f.properties.permitNumber,
        name: f.properties.locationName,
        river: riverOf(f.properties.river, point),
        coordinates: point,
        isDischarging: f.properties.isDischarging,
      })
    })

    scatterResponse[0].data.forEach(function (row) {
      const outfall = state.outfalls.get(row.permitNumber)
      if (!outfall) {
        return
      }
      state.events.push({
        permit: row.permitNumber,
        name: row.locationName,
        river: outfall.river,
        rain24h: Number(row.rain24h),
        priorRain: row.rain48h === null ? null : Number(row.rain48h) - Number(row.rain24h),
        hours: Number(row.durationHours),
        start: row.startTime,
      })
    })

    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    $('#last-updated').text('Live, updated ' + time)

    fillOutfallSelect()
    render(true)
    startMap()
  })
  .fail(function () {
    $('#last-updated').text('Live data unavailable')
    $('#scatter .empty-message').text(
      "Spill data isn't available right now. Try again in a few minutes."
    )
    $('#ranking-body .empty-message').text("Outfall data isn't available right now.")
    $('#map').addClass('map-error').text('No map data right now.')
  })
