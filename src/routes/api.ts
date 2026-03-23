import { Router } from 'express';
import { pingDb } from '../db.js';
import { leadsRouter } from './leads.js';
import { clubeRouter } from './clube.js';
import { plansRouter } from './plans.js';
import { adminApiRouter } from './adminApi.js';
import { authRouter } from './auth.routes.js';
import { saasRouter } from './saas.routes.js';
import { portalRouter } from './portal.routes.js';
import { portalDataRouter } from './portalData.routes.js';
import { estoqueRouter } from './estoque.routes.js';
import { clientRouter } from './client.routes.js';
import { siteConfigRouter } from './siteConfig.routes.js';
import { hotspotPublicRouter } from './hotspotPublic.routes.js';

export const apiRouter = Router();

apiRouter.use('/site', siteConfigRouter);
apiRouter.use('/plans', plansRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/saas', saasRouter);
// /portal/estoque antes de /portal para que rotas do estoque não sejam capturadas pelo portal
apiRouter.use('/portal/estoque', estoqueRouter);
// portalData antes de portal para que POST /api/portal/upload-logo seja encontrado
apiRouter.use('/portal', portalDataRouter);
apiRouter.use('/portal', portalRouter);
apiRouter.use('/client', clientRouter);
apiRouter.use('/', hotspotPublicRouter);

apiRouter.get('/health', async (_req, res) => {
  try {
    const ok = await pingDb();
    return res.json({ ok, ts: new Date().toISOString() });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: err });
  }
});

apiRouter.use('/assinaturas', leadsRouter);
apiRouter.use('/clube', clubeRouter);
apiRouter.use('/admin', adminApiRouter);
