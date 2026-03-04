import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import Category from '../models/Category';
import Product from '../models/Product';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('categories:read'), async (_req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1 });
    const productCounts = await Product.aggregate([
      { $match: { 'category._id': { $exists: true, $ne: null } } },
      { $group: { _id: '$category._id', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      productCounts.map((p) => [p._id.toString(), p.count])
    );
    const categoriesWithCount = categories.map((c) => ({
      ...c.toObject(),
      productCount: countMap.get(c._id.toString()) ?? 0,
    }));
    res.json({ success: true, data: categoriesWithCount });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', requirePermission('categories:read'), async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    return next(error);
  }
});

router.post('/', requirePermission('categories:create'), async (req, res, next) => {
  try {
    const category = new Category(req.body);
    await category.save();
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', requirePermission('categories:update'), async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requirePermission('categories:delete'), async (req, res, next) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, data: { message: 'Category deleted successfully' } });
  } catch (error) {
    return next(error);
  }
});

export default router;
