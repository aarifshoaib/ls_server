import { Router } from 'express';
import { RoleController } from '../controllers/role.controller';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all roles
router.get('/', RoleController.getAll);

// Get available modules and actions
router.get('/modules-actions', RoleController.getModulesAndActions);

// Get role by ID
router.get('/:id', RoleController.getById);

// Get role by name
router.get('/name/:name', RoleController.getByName);

// Create role (admin only)
router.post('/', requireRole(['super_admin', 'admin']), RoleController.create);

// Update role (admin only)
router.put('/:id', requireRole(['super_admin', 'admin']), RoleController.update);

// Delete role (admin only)
router.delete('/:id', requireRole(['super_admin', 'admin']), RoleController.delete);

export default router;
