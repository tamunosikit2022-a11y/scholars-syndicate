import { Router } from 'express';
import { requireRole } from '../auth/middleware';

/** Teacher area: teachers and admins may enter. */
export function teacherRouter() {
  const router = Router();
  router.use(requireRole('teacher', 'admin'));
  router.get('/ping', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, area: 'teacher' });
  });
  return router;
}

/** Admin area: admins only. */
export function adminRouter() {
  const router = Router();
  router.use(requireRole('admin'));
  router.get('/ping', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, area: 'admin' });
  });
  return router;
}
