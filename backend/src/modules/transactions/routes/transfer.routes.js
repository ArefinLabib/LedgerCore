import { Router } from 'express';
import { transferController } from '../controller/transfer.controller.js';

import { createAuthMiddleware } from 'authentication';

const router = Router();
const authenticateToken = createAuthMiddleware();

router.post('/transfer', authenticateToken, transferController.transfer);

export default router;