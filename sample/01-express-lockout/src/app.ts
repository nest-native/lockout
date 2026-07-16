import {
  InMemoryLockoutStore,
  LockoutManager,
  type Identifiers,
} from '@authlock/core';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

// The one demo credential. A real app checks a password hash here; the lockout
// engine does not care how you verify — it only needs the failure/success
// outcome. NOTHING in this file imports NestJS or any DI container: the engine
// is plain TypeScript over its in-memory store.
const DEMO_PASSWORD = 'correct horse battery staple';

export function createApp(now: () => number = () => Date.now()): Express {
  const manager = new LockoutManager({
    store: new InMemoryLockoutStore(),
    limit: 3,
    cooloffMs: 15 * 60_000, // 15 minutes
    parameters: [['username'], ['ip']], // lock by username OR by source IP
    now,
  });

  // Identity extraction is the application's trust decision. Here we use the
  // parsed username and the request's socket IP; a real deployment behind a
  // proxy must terminate and validate `X-Forwarded-For` itself before trusting
  // it (the engine never reads proxy headers for you).
  const identify = (req: Request): Identifiers => ({
    username: typeof req.body?.username === 'string' ? req.body.username : undefined,
    ip: req.ip,
  });

  const sendLocked = (res: Response, retryAfterMs: number | null): void => {
    res.setHeader('Retry-After', Math.ceil((retryAfterMs ?? 0) / 1000));
    res.status(429).json({ error: 'locked', retryAfterMs });
  };

  const app = express();
  app.use(express.json());

  app.post(
    '/login',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const identity = identify(req);

        // Pre-authentication gate: reject a locked identity before we even look
        // at the credential.
        const gate = await manager.check(identity);
        if (gate.locked) {
          sendLocked(res, gate.retryAfterMs);
          return;
        }

        if (req.body?.password !== DEMO_PASSWORD) {
          const decision = await manager.recordFailure(identity);
          if (decision.locked) {
            // This very attempt tripped the lock.
            sendLocked(res, decision.retryAfterMs);
            return;
          }
          res.status(401).json({ error: 'invalid_credentials' });
          return;
        }

        // Success clears the failure counters for this identity.
        await manager.recordSuccess(identity);
        res.status(200).json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  return app;
}
