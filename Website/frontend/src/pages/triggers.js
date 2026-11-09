/* global $, maplibregl */

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

// "Lea|Lee|Bow" would also match Fleet Brook, River Leach and Bow Brook
const LEA_RIVERS = encodeURIComponent('\\bRiver (Lea|Lee)\\b|Bow Creek')

const RAIN_MAX_MM = 30
const HOURS_MAX = 20
const DEFAULT_RAIN_MM = 4
const WET_PRIOR_MM = 2
const TOP_ROWS = 5

const state = {
  events: [],
  outfalls: new Map(),
  wetOnly: false,
  outfall: 'all',
  maxRain: DEFAULT_RAIN_MM,
  showAll: false,
}

let map = null
let dots = []

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

function filteredEvents() {
  return state.events.filter(function (e) {
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

function drawScatter(events) {
  const $plot = $('#scatter')
  $plot.find('.dot').remove()

  dots = events.map(function (e) {
    const x = Math.min(e.rain24h / RAIN_MAX_MM, 1) * 100
    const y = Math.min(e.hours / HOURS_MAX, 1) * 100
    const dot = $('<span class="dot"></span>')
      .css({ left: x + '%', bottom: y + '%' })
      .attr(
        'title',
        e.name +
          '\n' +
          formatMm(e.rain24h) +
          ' of rain, ' +
          e.hours +
          ' h spill, ' +
          formatDate(e.start)
      )
    $plot.append(dot)
    return { el: dot, event: e }
  })
}

function updateSelection(events) {
  dots.forEach(function (d) {
    d.el.toggleClass('selected', isSelected(d.event))
  })

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

function updateRanking(byOutfall) {
  const rows = Array.from(byOutfall.values()).sort(function (a, b) {
    return a.lowestRain - b.lowestRain || b.spills - a.spills
  })

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
      .append($('<td>').text(row.river))
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

  const lowest = events.reduce(function (a, b) {
    return b.rain24h < a.rain24h ? b : a
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

function render(redrawDots) {
  const events = filteredEvents()
  const byOutfall = summarise(events)

  if (redrawDots) {
    drawScatter(events)
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
    named.set(e.permit, e.name)
  })

  const $select = $('#outfall-select')
  Array.from(named.entries())
    .sort(function (a, b) {
      return a[1].localeCompare(b[1])
    })
    .forEach(function (entry) {
      $('<option>').val(entry[0]).text(entry[1]).appendTo($select)
    })
}

function startMap() {
  if (typeof maplibregl === 'undefined') {
    $('#map').addClass('map-error').text("The map couldn't load.")
    return
  }

  const withSpills = new Set(
    state.events.map(function (e) {
      return e.permit
    })
  )
  const bounds = new maplibregl.LngLatBounds()
  state.outfalls.forEach(function (o) {
    if (withSpills.has(o.permit)) {
      bounds.extend(o.coordinates)
    }
  })

  try {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/positron',
      bounds: bounds.isEmpty() ? [-0.08, 51.5, 0.03, 51.63] : bounds,
      fitBoundsOptions: { padding: 32 },
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
        'circle-radius': ['case', ['>', ['get', 'spills'], 0], 5, 3],
        'circle-color': '#c5ccd3',
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
        'circle-radius': ['interpolate', ['linear'], ['get', 'selected'], 1, 6, 20, 14],
        'circle-color': '#e9a23b',
        'circle-stroke-color': '#3a2a10',
        'circle-stroke-width': 1.5,
      },
    })

    map.addLayer({
      id: 'outfalls-spilling',
      type: 'circle',
      source: 'outfalls',
      filter: ['==', ['get', 'spilling'], true],
      paint: {
        'circle-radius': 11,
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

$('#wet-only').on('change', function () {
  state.wetOnly = this.checked
  render(true)
})

$('#outfall-select').on('change', function () {
  state.outfall = this.value
  render(true)
})

$('#show-all').on('click', function () {
  state.showAll = !state.showAll
  render(false)
})

$('#clear-selection').on('click', function () {
  state.wetOnly = false
  state.outfall = 'all'
  state.maxRain = DEFAULT_RAIN_MM
  state.showAll = false
  $('#wet-only').prop('checked', false)
  $('#outfall-select').val('all')
  $('#rain-slider').val(DEFAULT_RAIN_MM)
  render(true)
})

$('#last-updated').text('Loading live data…')

$.when(
  $.getJSON(API_URL + '/analysis/scatter?limit=5000&river=' + LEA_RIVERS),
  $.getJSON(API_URL + '/outfalls/geojson?river=' + LEA_RIVERS)
)
  .done(function (scatterResponse, geojsonResponse) {
    state.events = scatterResponse[0].data.map(function (row) {
      return {
        permit: row.permitNumber,
        name: row.locationName,
        river: row.river,
        rain24h: Number(row.rain24h),
        priorRain: row.rain48h === null ? null : Number(row.rain48h) - Number(row.rain24h),
        hours: Number(row.durationHours),
        start: row.startTime,
      }
    })

    geojsonResponse[0].features.forEach(function (f) {
      state.outfalls.set(f.properties.permitNumber, {
        permit: f.properties.permitNumber,
        name: f.properties.locationName,
        coordinates: f.geometry.coordinates,
        isDischarging: f.properties.isDischarging,
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
