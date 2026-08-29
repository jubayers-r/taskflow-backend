import { Router } from 'express';

import { AuthController } from './auth.controller';

const router = Router();

router.post('/login', AuthController.loginHandler);
router.post('/refresh', AuthController.refreshHandler);
router.post('/logout', AuthController.logoutHandler);

// Example protected endpoint
router.get('/me', async (req, res) => {
  return res.status(200).json({ user: req.user });
});

export const authRoutes = router;
