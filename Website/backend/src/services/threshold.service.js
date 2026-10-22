import { pool } from '../db/db.js';

export async function getOutfallThresholds(maxRainMm = null) {
  const params = [];
  let havingSql = '';

  if (maxRainMm !== null && !Number.isNaN(Number(maxRainMm))) {
    havingSql = 'HAVING minRain24hMm <= ?';
    params.push(Number(maxRainMm));
  }

  const [rows] = await pool.query(
    `SELECT
       o.permit_number AS permitNumber,
       o.location_name AS locationName,
       o.receiving_watercourse AS receivingWaterCourse,
       o.lat,
       o.lng,
       MIN(se.rain_24h_mm) AS minRain24hMm,
       ROUND(AVG(se.rain_24h_mm), 2) AS avgRain24hMm,
       COUNT(se.id) AS spillCount
     FROM outfalls o
     JOIN spill_event se ON o.permit_number = se.outfall_id
     WHERE se.rain_24h_mm IS NOT NULL
     GROUP BY o.permit_number, o.location_name, o.receiving_watercourse, o.lat, o.lng
     ${havingSql}
     ORDER BY minRain24hMm ASC`,
    params
  );

  return rows;
}