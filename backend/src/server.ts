import { createApp } from './app.js';
import { env } from './config/env.js';
import { disconnectDatabase, prisma, verifyDatabaseConnection } from './config/prisma.js';

async function bootstrap() {
  try {
    await verifyDatabaseConnection();
    // eslint-disable-next-line no-console
    console.log('[database] connected to MySQL');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[database] connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.API_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] AttendEase API listening on http://localhost:${env.API_PORT}`);
    // eslint-disable-next-line no-console
    console.log(`[api] health check: http://localhost:${env.API_PORT}/api/health`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[api] fatal startup error:', error);
  void prisma.$disconnect();
  process.exit(1);
});
