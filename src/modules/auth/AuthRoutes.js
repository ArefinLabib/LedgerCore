import { Router } from 'express';
import { AuthController } from './AuthController.js';

const router = Router();

router.post('/signup', AuthController.register);
router.post('/login', AuthController.login);

export default router;
