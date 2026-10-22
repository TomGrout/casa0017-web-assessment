import { getAllOutfalls, getOutfallByPermit } from '../services/outfalls.service.js';

export async function listOutfalls(req, res, next) {
  try {
    const { river } = req.query;
    const data = await getAllOutfalls(river);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
}

export async function getSingleOutfall(req, res, next) {
  try {
    const data = await getOutfallByPermit(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Outfall not found' });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}