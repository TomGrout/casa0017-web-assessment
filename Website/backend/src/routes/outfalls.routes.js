import { Router } from 'express';
import { listOutfalls, getSingleOutfall } from '../controllers/outfalls.controller.js';

const router = Router();

router.get('/', listOutfalls);
router.get('/:id', getSingleOutfall);

export default router;