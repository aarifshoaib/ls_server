import { Router } from 'express';
import { body, param } from 'express-validator';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all users
router.get('/', UserController.getAll);

// Get user by ID
router.get('/:id',
  validate([param('id').isMongoId().withMessage('Valid user ID is required')]),
  UserController.getById
);

// Create user
router.post(
  '/',
  validate([
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('role').isIn(['super_admin', 'admin', 'manager', 'sales', 'warehouse', 'delivery', 'accountant', 'viewer'])
      .withMessage('Valid role is required'),
  ]),
  UserController.create
);

// Update user
router.put(
  '/:id',
  validate([
    param('id').isMongoId().withMessage('Valid user ID is required'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
    body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  ]),
  UserController.update
);

// Delete user
router.delete(
  '/:id',
  validate([param('id').isMongoId().withMessage('Valid user ID is required')]),
  UserController.delete
);

// Update user status
router.put(
  '/:id/status',
  validate([
    param('id').isMongoId().withMessage('Valid user ID is required'),
    body('status').isIn(['active', 'inactive', 'suspended']).withMessage('Valid status is required'),
  ]),
  UserController.updateStatus
);

// Change password (for admins to change user's password)
router.put(
  '/:id/password',
  validate([
    param('id').isMongoId().withMessage('Valid user ID is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ]),
  UserController.changePassword
);

// Update profile (for current user)
router.put('/me/profile',
  validate([
    body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
    body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
    body('phone').optional(),
  ]),
  UserController.updateProfile
);

// Change own password
router.put('/me/password',
  validate([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ]),
  UserController.changeOwnPassword
);

export default router;
