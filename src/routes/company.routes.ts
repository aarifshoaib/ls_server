import { Router } from 'express';
import { body, param } from 'express-validator';
import { CompanyController } from '../controllers/company.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('employees:read'), CompanyController.list);

router.get(
  '/:id',
  requirePermission('employees:read'),
  validate([param('id').isMongoId().withMessage('Valid ID required')]),
  CompanyController.getById
);

router.post(
  '/',
  requirePermission('users:update'),
  validate([
    body('code').trim().notEmpty().withMessage('Code is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
  ]),
  CompanyController.create
);

router.put(
  '/:id',
  requirePermission('users:update'),
  validate([param('id').isMongoId().withMessage('Valid ID required')]),
  CompanyController.update
);

export default router;
