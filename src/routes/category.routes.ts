import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import Category from '../models/Category';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('categories.read'), async (_req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('categories.create'), async (req, res, next) => {
  try {
    const category = new Category(req.body);
    await category.save();
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
});

export default router;
