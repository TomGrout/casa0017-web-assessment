# Rain to Spill - Backend API Guide

## Quick Start

**Base URL:** `http://localhost:3000/api`

---

## Data Available

| Data | Records | Coverage |
|------|---------|----------|
| Outfalls | 595 | 99% geocoded |
| Spill Events | 56,092 | Jan 2024 - Apr 2026 |
| Rainfall (24h/48h/72h) | 88% enriched | Per event |
| Tidal Phase (flood/ebb) | 100% enriched | Per event |

---

## Endpoints for Map

### 1. Get All Outfalls as GeoJSON (for map markers)

```
GET /api/outfalls/geojson
GET /api/outfalls/geojson?river=Lea|Lee|Bow
GET /api/outfalls/geojson?active=true
```

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-0.001, 51.53]
      },
      "properties": {
        "permitNumber": "CSAB.0530",
        "locationName": "Abbey Mills Pumping Station",
        "river": "River Lee",
        "isDischarging": false,
        "spillCount": 47,
        "minRain24h": 2.1,
        "avgRain24h": 8.5
      }
    }
  ]
}
```

**Use for:** Plotting outfall markers on map. Color by `isDischarging` (red=active).

---

### 2. Get Tidal Analysis (flood vs ebb by river)

```
GET /api/analysis/tidal
GET /api/analysis/tidal?rivers=Lea,Lee,Bow,Thames
```

**Response:**
```json
{
  "data": [
    {
      "river": "River Lea",
      "totalEvents": 28,
      "floodCount": 17,
      "ebbCount": 11,
      "floodPct": 60.7,
      "ebbPct": 39.3
    }
  ]
}
```

**Use for:** Bar chart showing flood vs ebb percentage per river.

---

### 3. Get Rainfall Thresholds

```
GET /api/analysis/thresholds
GET /api/analysis/thresholds?river=Thames&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "permitNumber": "CSSA.0362",
      "locationName": "CROSSNESS WWTW",
      "river": "River Thames",
      "lat": 51.51,
      "lng": 0.14,
      "spillCount": 72,
      "minRain24h": 0,
      "avgRain24h": 8.93,
      "minRain48h": 0,
      "avgRain48h": 13.02
    }
  ]
}
```

**Use for:** Scatter plot of rainfall thresholds, or heatmap on map.

---

### 4. Get Scatter Plot Data

```
GET /api/analysis/scatter?river=Thames&limit=500
```

**Response:**
```json
{
  "data": [
    {
      "permitNumber": "CSAB.0532",
      "locationName": "SAVOY STREET CSO",
      "river": "River Thames",
      "rain24h": 5.2,
      "rain48h": 8.1,
      "tidalPhase": "FLOOD",
      "durationHours": 3.5,
      "startTime": "2026-04-29T09:46:00Z"
    }
  ]
}
```

**Use for:** Scatter plot (x=rainfall, y=duration, color=tidalPhase).

---

### 5. Get Summary Stats (for dashboard)

```
GET /api/analysis/summary
```

**Response:**
```json
{
  "data": {
    "totals": {
      "events": 56092,
      "withRainfall": 49114,
      "withTidal": 56092,
      "outfalls": 529,
      "rainfallPct": 88,
      "tidalPct": 100
    },
    "dateRange": {
      "earliest": "2024-01-01T00:00:00Z",
      "latest": "2026-04-29T18:00:00Z"
    },
    "topRivers": [
      {"river": "River Thames", "eventCount": 3924}
    ]
  }
}
```

---

### 6. Get Antecedent Wetness Analysis

```
GET /api/analysis/antecedent
GET /api/analysis/antecedent?river=Lea
```

**Response:**
```json
{
  "data": [
    {
      "rain24hBin": "0-2mm",
      "eventCount": 1801,
      "avgRain24h": 0.5,
      "avgRain48h": 4.31,
      "avgRain72h": 9.04,
      "avgPrior24h": 3.81
    }
  ]
}
```

**Use for:** Bar chart showing how prior rainfall affects spills.

---

## Other Useful Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/outfalls` | List all outfalls (JSON) |
| `GET /api/outfalls/:id` | Single outfall details |
| `GET /api/outfalls/:id/history` | Spill history for outfall |
| `GET /api/tide/forecast` | 7-day tide predictions |
| `GET /api/events?limit=100` | Recent spill events |

---

## Key Findings from Data

1. **River Lea/Lee:** ~60% of spills occur during **flood tide** (sewage trapped inland)
2. **River Thames:** 50/50 flood vs ebb (balanced)
3. **Low rainfall spills:** 1,800 events with <2mm rain - antecedent wetness matters

---

## Example: Fetching GeoJSON for Map

```javascript
// Fetch outfalls for Leaflet/MapLibre
const response = await fetch('http://localhost:3000/api/outfalls/geojson');
const geojson = await response.json();

// Add to map
map.addSource('outfalls', { type: 'geojson', data: geojson });
map.addLayer({
  id: 'outfall-points',
  type: 'circle',
  source: 'outfalls',
  paint: {
    'circle-color': ['case', ['get', 'isDischarging'], '#ff0000', '#00ff00'],
    'circle-radius': 6
  }
});
```

---

## Questions?

Check `docs/api/openapi.yaml` for full API spec or `docs/api/insomnia.json` to import into Insomnia/Postman.
