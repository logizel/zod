import { startBot } from './bot.js';

// Contract-fixed entrypoint: env/PocketBase gate runs inside startBot before
// the gateway opens. The gateway connection + cron delivery timers keep the
// process alive until SIGINT/SIGTERM.
export async function main(): Promise<void> {
  const runtime = await startBot();

  const shutdown = (signal: string): void => {
    void runtime
      .stop()
      .catch((err: unknown) => {
        console.error('bot shutdown failed', err);
      })
      .finally(() => process.exit(0));
    console.log(`[bot] ${signal} received, shutting down`);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('bot boot failed', err);
  process.exit(1);
});
