/**
 * Fill in river names, placeholder names and wrong positions for outfalls
 * imported from EDM history, using the Thames Water discharge status feed.
 *
 * Run with: node src/scripts/backfill-outfall-details.js [--apply]
 *
 * EDM history rows use Thames Water's uniqueId (e.g. TWL00002) as their
 * permit_number, and the feed carries the same uniqueId, so rows are matched
 * by ID, not by name. Only these fields change:
 * - receiving_watercourse, when it is "Unknown", "N/A" or empty
 * - location_name, when it is "Unknown", "N/A" or empty
 * - easting, northing, lat and lng, when missing or more than 250 m from the feed
 *
 * Rain was looked up at each outfall's old position, so when a position changes
 * the rain values of its spills are cleared. Run backfill-rainfall.js afterwards
 * to fetch them again for the right place.
 *
 * Without --apply it only prints what would change. With --apply it first saves
 * the old values to outfall-details-backup-<time>.json in the current folder.
 */

import fs from 'node:fs';
import axios from 'axios';
import config from '../config/env.js';
import { pool } from '../db/db.js';
import { osgbToLatLng } from '../utils/index.js';
import { calculateDistance } from '../utils/haversine.js';

const APPLY = process.argv.includes('--apply');
const MAX_OFFSET_M = 250;
const PAGE_SIZE = 1000;
const PLACEHOLDERS = new Set(['', 'unknown', 'n/a']);

const isPlaceholder = (value) => PLACEHOLDERS.has(String(value ?? '').trim().toLowerCase());

async function fetchFeed() {
  const items = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await axios.get(`${config.apis.thamesWaterBaseUrl}/discharge/status`, {
      params: { limit: PAGE_SIZE, offset },
      timeout: config.apis.timeoutMs
    });
    const page = Array.isArray(data?.items) ? data.items : [];
    items.push(...page);
    if (page.length < PAGE_SIZE) {
      return items;
    }
  }
}

function changesFor(row, item) {
  const changes = {};
  const river = item.receivingWaterCourse?.trim();
  const name = item.locationName?.trim();

  if (isPlaceholder(row.receiving_watercourse) && river) {
    changes.receiving_watercourse = river;
  }
  if (isPlaceholder(row.location_name) && name) {
    changes.location_name = name;
  }

  const easting = Number(item.x);
  const northing = Number(item.y);
  if (easting > 0 && northing > 0) {
    const { lat, lng } = osgbToLatLng(easting, northing);
    const offsetM = row.lat == null || row.lng == null
      ? Infinity
      : calculateDistance(row.lat, row.lng, lat, lng) * 1000;
    if (offsetM > MAX_OFFSET_M) {
      Object.assign(changes, {
        easting,
        northing,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6))
      });
      return { changes, offsetM };
    }
  }
  return { changes, offsetM: 0 };
}

async function main() {
  console.log(`[Outfall Details] ${APPLY ? 'APPLY' : 'Dry run (add --apply to write)'}\n`);

  const feed = await fetchFeed();
  const byUniqueId = new Map(feed.map((item) => [item.uniqueId, item]));
  console.log(`  Thames Water feed: ${feed.length} outfalls`);

  const [rows] = await pool.query(`
    SELECT permit_number, location_name, receiving_watercourse, easting, northing, lat, lng
    FROM outfalls
    WHERE permit_number LIKE 'TWL%'
  `);
  console.log(`  EDM history outfalls in database: ${rows.length}\n`);

  const updates = [];
  const notInFeed = [];
  for (const row of rows) {
    const item = byUniqueId.get(row.permit_number);
    if (!item) {
      notInFeed.push(row);
      continue;
    }
    const { changes, offsetM } = changesFor(row, item);
    const fields = Object.keys(changes);
    if (fields.length > 0) {
      const before = Object.fromEntries(fields.map((field) => [field, row[field]]));
      updates.push({ id: row.permit_number, name: row.location_name, before, changes, offsetM });
    }
  }

  const count = (field) => updates.filter((u) => field in u.changes).length;
  console.log(`  River names to fill in: ${count('receiving_watercourse')}`);
  console.log(`  Placeholder names to fill in: ${count('location_name')}`);
  console.log(`  Positions to correct: ${count('lat')}`);
  console.log(`  Not in the feed (left as they are): ${notInFeed.length}\n`);

  const moved = updates.filter((u) => 'lat' in u.changes).sort((a, b) => b.offsetM - a.offsetM);
  for (const u of moved.slice(0, 10)) {
    const km = Number.isFinite(u.offsetM) ? `${(u.offsetM / 1000).toFixed(1)} km` : 'no position';
    console.log(`  ${u.id} ${u.name}: moved ${km}`);
  }
  if (notInFeed.length > 0) {
    console.log(`\n  Not in feed: ${notInFeed.map((r) => `${r.permit_number} ${r.location_name}`).join(', ')}`);
  }

  const movedIds = moved.map((u) => u.id);
  let spillRain = [];
  if (movedIds.length > 0) {
    [spillRain] = await pool.query(`
      SELECT id, outfall_id, rain_24h_mm, rain_48h_mm, rain_72h_mm
      FROM spill_event
      WHERE outfall_id IN (?)
        AND (rain_24h_mm IS NOT NULL OR rain_48h_mm IS NOT NULL OR rain_72h_mm IS NOT NULL)
    `, [movedIds]);
  }
  console.log(`\n  Spills with rain from the wrong position, to clear: ${spillRain.length}`);

  if (!APPLY || updates.length === 0) {
    return;
  }

  const backupFile = `outfall-details-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const backup = {
    outfalls: updates.map(({ id, before }) => ({ id, before })),
    spillRain
  };
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\n  Old values saved to ${backupFile}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const u of updates) {
      await connection.query('UPDATE outfalls SET ? WHERE permit_number = ?', [u.changes, u.id]);
    }
    if (movedIds.length > 0) {
      await connection.query(`
        UPDATE spill_event
        SET rain_24h_mm = NULL, rain_48h_mm = NULL, rain_72h_mm = NULL
        WHERE outfall_id IN (?)
      `, [movedIds]);
    }
    await connection.commit();
    console.log(`  Updated ${updates.length} outfalls and cleared rain for ${spillRain.length} spills`);
    console.log('  Next: node src/scripts/backfill-rainfall.js');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

main()
  .catch((err) => {
    console.error('[Outfall Details] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
