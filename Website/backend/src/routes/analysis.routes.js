/**
 * Analysis Routes
 *
 * GET /api/analysis/tidal      - Flood vs ebb % by river
 * GET /api/analysis/thresholds - Rainfall thresholds per outfall
 * GET /api/analysis/antecedent - 48h/72h rainfall patterns
 * GET /api/analysis/summary    - Dashboard summary stats
 * GET /api/analysis/scatter    - Scatter plot data
 */

import { Router } from 'express';
import {
  getTidalStats,
  getThresholds,
  getAntecedent,
  getSummary,
  getScatter
} from '../controllers/analysis.controller.js';

const router = Router();

router.get('/tidal', getTidalStats);
router.get('/thresholds', getThresholds);
router.get('/antecedent', getAntecedent);
router.get('/summary', getSummary);
router.get('/scatter', getScatter);

export default router;
