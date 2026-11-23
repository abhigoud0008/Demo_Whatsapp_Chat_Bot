import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  processAuthLogin,
  processPasswordResetRequest,
} from './server/authHandler.ts';
import {
  getIntegrationStatus,
  handleAdminNotify,
  handleWebhookEvent,
  handleWebhookVerify,
  type RawBodyRequest,
} from './server/webhookHandler.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Sliding-window in-memory rate limiter (120 requests/min per IP on /api/*)
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 120;

  const entry = rateBucket.get(key);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }

  if (entry.count >= maxRequests) {
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
    return;
  }

  entry.count += 1;
  next();
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);

  // Capture exact raw request bytes for Meta X-Hub-Signature-256 verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf;
      },
    })
  );

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // API Routes
  app.use('/api', rateLimiter);
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ...getIntegrationStatus() });
  });
  app.get('/api/health/status', (_req, res) => {
    res.json(getIntegrationStatus());
  });
  app.post('/api/auth/login', (req, res) => {
    void processAuthLogin({
      body: req.body,
      clientIp: req.ip || 'unknown',
    }).then((result) => res.status(result.status).json(result.body));
  });
  app.post('/api/auth/password-reset', (req, res) => {
    void processPasswordResetRequest({
      body: req.body,
      clientIp: req.ip || 'unknown',
    }).then((result) => res.status(result.status).json(result.body));
  });
  app.get('/api/webhook/whatsapp', handleWebhookVerify);
  app.post('/api/webhook/whatsapp', (req, res) => {
    void handleWebhookEvent(req as RawBodyRequest, res);
  });
  app.post('/api/whatsapp/notify', (req, res) => {
    void handleAdminNotify(req, res);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GrievanceFlow server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
