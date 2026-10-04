import { Router } from 'express';
import { AccountController } from '../controller/Account.controller.js';
import { createAuthMiddleware } from 'authentication';

const router = Router();
const authenticateToken = createAuthMiddleware();

router.post('/', authenticateToken, AccountController.createAccount);
router.get('/', authenticateToken, AccountController.getMyAccounts);

export default router;
