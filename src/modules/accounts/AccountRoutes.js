import { Router } from 'express';
import { AccountController } from './AccountController.js';
import { createAuthMiddleware } from 'authentication';

const router = Router();
const authenticateToken = createAuthMiddleware();

router.post('/', authenticateToken, AccountController.createAccount);

export default router;
