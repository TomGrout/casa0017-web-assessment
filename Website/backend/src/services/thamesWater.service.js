import axios from 'axios';
import config from '../config/env.js';
import { pool } from '../db/db.js';

const client = axios.create({
  baseURL: config.apis.thamesWaterBaseUrl,
  timeout: config.apis.timeoutMs
});

const TARGET_RIVERS = ['lee', 'lea', 'bow', 'thames'];

const isTargetRiver = (watercourse = '') => {
  const lower = watercourse.toLowerCase();
  return TARGET_RIVERS.some((river) => lower.includes(river));
};

const toMysqlDateTime = (isoString) => {
  if (!isoString) return null;
  const date = new Date(isoString);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizeOutfall = (item) => ({
  permitNumber: item.PermitNumber,
  locationName: item.LocationName,
  receivingWaterCourse: item.ReceivingWaterCourse,
  easting: Number(item.X),
  northing: Number(item.Y),
  alertStatus: item.AlertStatus,
  isDischarging:
    item.AlertStatus === 'Discharging' ||
    item.AlertStatus === '1' ||
    item.AlertStatus === 1,
  mostRecentStart: item.MostRecentDischargeAlertStart || null,
  mostRecentStop: item.MostRecentDischargeAlertStop || null
});

export async function fetchDischargeStatus() {
  try {
    const { data } = await client.get('/discharge/status');
    const rawList = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    const outfalls = rawList
      .filter((item) => isTargetRiver(item.ReceivingWaterCourse))
      .map(normalizeOutfall);

    if (outfalls.length > 0) {
      await cacheOutfallStatus(outfalls);
    }

    return {
      source: 'live',
      fetchedAt: new Date().toISOString(),
      count: outfalls.length,
      items: outfalls
    };
  } catch (error) {
    const cached = await getCachedOutfallStatus();
    return {
      source: 'cache_fallback',
      fetchedAt: new Date().toISOString(),
      error: error.message,
      count: cached.length,
      items: cached
    };
  }
}

export async function fetchDischargeAlerts(permitNumber = null) {
  try {
    const params = permitNumber ? { permitNumber } : {};
    const { data } = await client.get('/discharge/alerts', { params });
    const rawList = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    const alerts = rawList
      .filter((item) => isTargetRiver(item.ReceivingWaterCourse))
      .map((item) => ({
        permitNumber: item.PermitNumber,
        locationName: item.LocationName,
        receivingWaterCourse: item.ReceivingWaterCourse,
        alertType: item.AlertType || item.AlertStatus,
        startTime: item.MostRecentDischargeAlertStart || item.DateTime || null,
        stopTime: item.MostRecentDischargeAlertStop || null
      }));

    return {
      source: 'live',
      fetchedAt: new Date().toISOString(),
      count: alerts.length,
      items: alerts
    };
  } catch (error) {
    const cached = await getCachedAlerts(permitNumber);
    return {
      source: 'cache_fallback',
      fetchedAt: new Date().toISOString(),
      error: error.message,
      count: cached.length,
      items: cached
    };
  }
}

async function cacheOutfallStatus(outfalls) {
  const values = outfalls.map((o) => [
    o.permitNumber,
    o.locationName,
    o.receivingWaterCourse,
    o.easting,
    o.northing,
    o.isDischarging ? 1 : 0,
    toMysqlDateTime(o.mostRecentStart),
    toMysqlDateTime(o.mostRecentStop)
  ]);

  const sql = `
    INSERT INTO outfalls (
      permit_number, location_name, receiving_watercourse,
      easting, northing, is_discharging,
      most_recent_start, most_recent_stop
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      is_discharging = VALUES(is_discharging),
      most_recent_start = VALUES(most_recent_start),
      most_recent_stop = VALUES(most_recent_stop),
      updated_at = CURRENT_TIMESTAMP
  `;

  await pool.query(sql, [values]);
}

async function getCachedOutfallStatus() {
  const [rows] = await pool.query(`
    SELECT
      permit_number AS permitNumber,
      location_name AS locationName,
      receiving_watercourse AS receivingWaterCourse,
      easting,
      northing,
      is_discharging AS isDischarging,
      most_recent_start AS mostRecentStart,
      most_recent_stop AS mostRecentStop,
      updated_at AS cachedAt
    FROM outfalls
    ORDER BY location_name ASC
  `);
  return rows;
}

async function getCachedAlerts(permitNumber) {
  const sql = permitNumber
    ? `SELECT outfall_id AS permitNumber, start_ts AS startTime, end_ts AS stopTime
       FROM spill_event WHERE outfall_id = ? ORDER BY start_ts DESC LIMIT 200`
    : `SELECT outfall_id AS permitNumber, start_ts AS startTime, end_ts AS stopTime
       FROM spill_event ORDER BY start_ts DESC LIMIT 200`;

  const [rows] = await pool.query(sql, permitNumber ? [permitNumber] : []);
  return rows;
}