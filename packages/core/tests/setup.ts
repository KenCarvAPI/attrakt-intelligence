/**
 * Test environment setup.
 *
 * Runs before any test module is imported, so the required config env vars are
 * present when `@attrakt/core`'s config/prisma modules load. Points Prisma at a
 * dedicated test database (override with DATABASE_URL to use your own).
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://attrakt:attrakt_dev@localhost:5432/attrakt_test';
// core's config validates REDIS_URL as a URL but never connects to it in tests.
process.env.REDIS_URL ||= 'redis://localhost:6379';
