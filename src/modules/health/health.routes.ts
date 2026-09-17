import { Router } from 'express';

import { healthPageHandler, livenessHandler, readinessHandler } from './health.controller';

const router = Router();

router.get('/', healthPageHandler);
router.get('/live', livenessHandler);
router.get('/ready', readinessHandler);

export const HealthRoutes = router;
