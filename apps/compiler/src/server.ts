import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { BOARD_SPECS, isSupportedBoard } from './boards.js';
import { CompileError, CompilerService } from './runner.js';

export interface ServerOptions {
  rateLimitPerMin?: number;
  maxConcurrentCompiles?: number;
  maxQueueSize?: number;
  corsOrigins?: string[];
}

class SimpleRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly maxPerMinute: number) {}

  check(ip: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const cutoff = now - 60_000;
    const prev = (this.hits.get(ip) ?? []).filter((ts) => ts > cutoff);
    if (prev.length >= this.maxPerMinute) {
      const oldest = prev[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
      this.hits.set(ip, prev);
      return { allowed: false, retryAfterSec };
    }
    prev.push(now);
    this.hits.set(ip, prev);
    if (this.hits.size > 2000) {
      const firstKey = this.hits.keys().next().value;
      if (firstKey) this.hits.delete(firstKey);
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}

function parseIntEnv(raw: string | undefined, fallback: number, min: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Matches exact origins or safe single-segment wildcards (e.g. `https://*.ardusim.pages.dev`, `http://localhost:*`). */
export function isOriginAllowed(origin: string | undefined, patterns: string[]): boolean {
  if (!origin || patterns.length === 0 || patterns.includes('*')) return true;
  for (const pattern of patterns) {
    if (origin === pattern) return true;
    if (!pattern.includes('*')) continue;
    const regexSource: string = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/.:@]+');
    if (new RegExp(`^${regexSource}$`).test(origin)) return true;
  }
  return false;
}

export function createCompilerServer(
  compiler = new CompilerService(),
  opts: ServerOptions = {}
) {
  const rateLimitPerMin = opts.rateLimitPerMin ?? parseIntEnv(process.env.RATE_LIMIT_PER_MIN, 120, 1);
  const maxConcurrent = opts.maxConcurrentCompiles ?? parseIntEnv(process.env.MAX_CONCURRENT_COMPILES, 2, 1);
  const maxQueueSize = opts.maxQueueSize ?? parseIntEnv(process.env.MAX_QUEUE_SIZE, 24, 0);
  const allowedOrigins = opts.corsOrigins ?? parseCorsOrigins(process.env.CORS_ORIGIN);
  const limiter = new SimpleRateLimiter(rateLimitPerMin);
  let activeCompiles = 0;
  const compileQueue: Array<() => void> = [];

  const acquireSlot = (rawRes: {
    on: (ev: 'close', cb: () => void) => unknown;
    off?: (ev: 'close', cb: () => void) => unknown;
    removeListener?: (ev: 'close', cb: () => void) => unknown;
    writableEnded?: boolean;
  }): Promise<'acquired' | 'full' | 'aborted'> => {
    if (activeCompiles < maxConcurrent) {
      activeCompiles++;
      return Promise.resolve('acquired');
    }
    if (compileQueue.length >= maxQueueSize) {
      return Promise.resolve('full');
    }
    return new Promise((resolve) => {
      let settled = false;
      const detach = () => {
        if (rawRes.off) rawRes.off('close', onClose);
        else rawRes.removeListener?.('close', onClose);
      };
      const grant = () => {
        if (settled) return;
        settled = true;
        detach();
        activeCompiles++;
        resolve('acquired');
      };
      const onClose = () => {
        if (settled || rawRes.writableEnded) return;
        settled = true;
        const idx = compileQueue.indexOf(grant);
        if (idx >= 0) compileQueue.splice(idx, 1);
        resolve('aborted');
      };
      compileQueue.push(grant);
      rawRes.on('close', onClose);
    });
  };

  const releaseSlot = (): void => {
    activeCompiles--;
    const next = compileQueue.shift();
    if (next) next();
  };

  const app = Fastify({
    logger: false,
    bodyLimit: 128 * 1024,
    trustProxy: true,
  });

  app.register(cors, {
    origin: (origin, cb) => {
      cb(null, isOriginAllowed(origin, allowedOrigins));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    if (req.headers['access-control-request-private-network'] === 'true') {
      reply.header('Access-Control-Allow-Private-Network', 'true');
    }
  });

  app.get('/', async () => ({
    service: 'ardusim-compiler',
    status: 'ok',
    health: '/api/health',
  }));

  app.get('/api/health', async (_req, reply) => {
    let engine = 'unavailable';
    try {
      engine = await compiler.resolveEngine();
    } catch {
      engine = 'unavailable';
    }
    const ok = engine !== 'unavailable';
    return reply.status(ok ? 200 : 503).send({
      ok,
      engine,
      boards: Object.keys(BOARD_SPECS),
      activeCompiles,
      queuedCompiles: compileQueue.length,
      maxConcurrentCompiles: maxConcurrent,
    });
  });

  app.post<{ Body: { board?: unknown; sketch?: unknown } }>('/api/compile', async (req, reply) => {
    const ip = req.ip || 'unknown';
    const rl = limiter.check(ip);
    if (!rl.allowed) {
      reply.header('Retry-After', String(rl.retryAfterSec));
      return reply.status(429).send({
        error: `Too many compile requests. Retry in ${rl.retryAfterSec}s.`,
      });
    }

    const { board = 'arduino-uno', sketch } = req.body ?? {};
    if (!isSupportedBoard(board)) {
      return reply.status(400).send({
        error: `Unsupported board: ${String(board)}`,
        supportedBoards: Object.keys(BOARD_SPECS),
      });
    }
    if (typeof sketch !== 'string') {
      return reply.status(400).send({ error: 'Field "sketch" must be a string' });
    }

    const slot = await acquireSlot(reply.raw);
    if (slot === 'aborted') {
      return;
    }
    if (slot === 'full') {
      return reply.status(503).send({
        error: 'Compiler queue is full, please retry in a moment.',
      });
    }

    try {
      const result = await compiler.compile(board, sketch);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof CompileError) {
        return reply.status(err.statusCode).send({
          error: err.message,
          logs: err.logs,
          diagnostics: err.diagnostics,
        });
      }
      return reply.status(500).send({ error: 'Unexpected compiler error' });
    } finally {
      releaseSlot();
    }
  });

  return app;
}

const isMain = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = parseIntEnv(process.env.PORT, 8080, 1);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = createCompilerServer();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down ArduSim compiler...`);
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  server
    .listen({ port, host })
    .then(() => {
      console.log(`ArduSim compiler listening on http://${host}:${port}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
