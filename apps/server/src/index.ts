import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';
import { loadConfig } from './config.js';
import { Logger } from './lib/logger.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  logger.info(`Starting SocialLive v${config.version}`, { dataDir: config.dataDir });

  const app = await buildApp({ config, logger });
  app.sl.orchestrator.recoverInterrupted();
  app.sl.scheduler.start();

  const pidPath = join(config.dataDir, 'app.pid');
  try {
    writeFileSync(pidPath, String(process.pid));
  } catch {
    // pid file is best-effort (used by the CLI)
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;
    logger.info(`Received ${signal} — stopping active streams and shutting down…`);
    try {
      await app.close();
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
    } finally {
      try {
        rmSync(pidPath, { force: true });
      } catch {
        // ignore
      }
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { error: String(reason) });
  });

  await app.listen({ port: config.port, host: config.host });
  logger.info(`SocialLive is ready → http://localhost:${config.port}`);
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
