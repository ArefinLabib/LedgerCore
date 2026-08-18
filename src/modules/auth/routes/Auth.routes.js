import { Router } from 'express';
import { AuthController } from '../controller/Auth.controller.js';

import { createAuthMiddleware, requireRole } from 'authentication';

const router = Router();
const authenticateToken = createAuthMiddleware();

router.post('/signup', AuthController.register);
router.post('/login', AuthController.login);
router.get('/users', authenticateToken, requireRole('admin'), AuthController.getUsers);
router.get('/users/:id', authenticateToken, AuthController.getUserProfile);

export default router;
