// Small helpers shared by the pages that work with London outfalls

import { LONDON_BOUNDARY } from './london.js'

// A box around Greater London, sent to the API as west,south,east,north
export const LONDON_BBOX = '-0.52,51.28,0.35,51.70'

const EDGE_TOLERANCE_M = 250
const KEEP_UPPER = ['CSO', 'PS', 'SR', 'STW', 'WWTW', 'SPS', 'LB']
const KEEP_LOWER = ['at', 'and', 'of', 'the']

export function insidePolygon(point, polygon) {
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
export function inLondon(point) {
  return (
    insidePolygon(point, LONDON_BOUNDARY) || metresToEdge(point, LONDON_BOUNDARY) < EDGE_TOLERANCE_M
  )
}

// Thames Water writes many names in capitals: "PUTNEY BRIDGE CSO" becomes "Putney Bridge CSO"
export function tidyName(name) {
  const words = name.trim().replace(/,$/, '').split(' ')
  return words
    .map(function (word, i) {
      const bare = word.replace(/[^A-Za-z0-9]/g, '')
      const shouting = bare.length > 1 && bare === bare.toUpperCase()
      const postcode = /^[A-Z]{1,2}[0-9]/.test(bare)
      if (!shouting || postcode || KEEP_UPPER.includes(bare)) {
        return word
      }
      if (i > 0 && KEEP_LOWER.includes(bare.toLowerCase())) {
        return word.toLowerCase()
      }
      const lower = word.toLowerCase()
      const first = lower.search(/[a-z]/)
      return lower.slice(0, first) + lower.charAt(first).toUpperCase() + lower.slice(first + 1)
    })
    .join(' ')
}
