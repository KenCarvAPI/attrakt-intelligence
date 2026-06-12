/**
 * dev:check — local baseline smoke test.
 *
 * Verifies the three things you need before doing any real work:
 *   1. PostgreSQL connectivity (Prisma `SELECT 1`)
 *   2. Redis connectivity (PING)
 *   3. The API /health endpoint responds and reports healthy
 *
 * Exits 0 when all checks pass, 1 otherwise. Env is loaded from .env via the
 * `--env-file` flag in the npm script.
 */

import { config, prisma } from '@attrakt/core';
import Redis from 'ioredis';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Hide the password in a connection string before printing it. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return url;
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'PostgreSQL', ok: true, detail: maskUrl(config.databaseUrl) };
  } catch (err) {
    return { name: 'PostgreSQL', ok: false, detail: errMsg(err) };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  // Swallow connection-error noise; failures surface via the thrown error below.
  client.on('error', () => undefined);
  try {
    await client.connect();
    const pong = await client.ping();
    return { name: 'Redis', ok: pong === 'PONG', detail: maskUrl(config.redisUrl) };
  } catch (err) {
    return { name: 'Redis', ok: false, detail: errMsg(err) };
  } finally {
    client.disconnect();
  }
}

async function checkApiHealth(): Promise<CheckResult> {
  const url = `http://localhost:${config.port}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    const ok = res.status === 200 && body.status === 'healthy';
    return { name: 'API /health', ok, detail: `${url} -> ${res.status} ${body.status ?? ''}`.trim() };
  } catch {
    return {
      name: 'API /health',
      ok: false,
      detail: `${url} unreachable — start it with \`pnpm --filter @attrakt/api dev\``,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  console.log('Running dev:check...\n');

  const results: CheckResult[] = [
    await checkDatabase(),
    await checkRedis(),
    await checkApiHealth(),
  ];

  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(13)} ${r.detail}`);
  }

  await prisma.$disconnect();

  const allOk = results.every((r) => r.ok);
  console.log(allOk ? '\nAll checks passed ✅' : '\nSome checks failed ❌');
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('dev:check crashed:', errMsg(err));
  process.exit(1);
});
