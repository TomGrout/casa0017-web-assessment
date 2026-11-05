/**
 * Analysis Controller
 *
 * Handles requests for aggregated analysis data
 */

import {
  getTidalStatsByRiver,
  getRainfallThresholds,
  getAntecedentAnalysis,
  getSummaryStats,
  getScatterData
} from '../services/analysis.service.js';

/**
 * GET /api/analysis/tidal
 * Returns flood vs ebb statistics by river
 */
export async function getTidalStats(req, res, next) {
  try {
    const { rivers, minEvents } = req.query;

    const options = {
      rivers: rivers ? rivers.split(',') : null,
      minEvents: minEvents ? parseInt(minEvents, 10) : 10
    };

    const stats = await getTidalStatsByRiver(options);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/thresholds
 * Returns rainfall thresholds per outfall
 */
export async function getThresholds(req, res, next) {
  try {
    const { river, maxThreshold, limit } = req.query;

    const options = {
      river: river || null,
      maxThreshold: maxThreshold ? parseFloat(maxThreshold) : null,
      limit: limit ? parseInt(limit, 10) : 100
    };

    const thresholds = await getRainfallThresholds(options);
    res.json({ data: thresholds });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/antecedent
 * Returns antecedent wetness analysis (48h/72h patterns)
 */
export async function getAntecedent(req, res, next) {
  try {
    const { river } = req.query;

    const analysis = await getAntecedentAnalysis({ river: river || null });
    res.json({ data: analysis });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/summary
 * Returns summary statistics for dashboard
 */
export async function getSummary(req, res, next) {
  try {
    const summary = await getSummaryStats();
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analysis/scatter
 * Returns scatter plot data (rainfall vs duration)
 */
export async function getScatter(req, res, next) {
  try {
    const { river, limit } = req.query;

    const options = {
      river: river || null,
      limit: limit ? parseInt(limit, 10) : 1000
    };

    const data = await getScatterData(options);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
