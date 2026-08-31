import { validate } from '@/middlewares/validate';
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthSchema } from './auth.schema';

const router = Router();

router.post('/login', validate(AuthSchema.loginSchema), AuthController.loginHandler);
router.post('/refresh', AuthController.refreshHandler);
router.post('/logout', AuthController.logoutHandler);

export const authRoutes = router;
