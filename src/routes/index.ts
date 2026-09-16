import { AuthRoutes } from '@/modules/auth/auth.routes';
import { Router } from 'express';

const router = Router();

const Routes = router;

router.use('/auth', AuthRoutes);

export default Routes;
