// Gateway entrypoint — fail-fast boot order replicating apps/bot/src/index.ts.
//
// Boot order: parseEnv (fail-fast on missing LLM keys) → createLogger → LlmRouter
// constructor (ladder validation, Cerebras absent) → one JSON boot line.
// main() runs and exits clean so the workspace contract stays provable.
// No LLM traffic starts before env.parse() succeeds (T-03-12).
import { parseEnv } from '@zod/config';
import { createLogger } from '@zod/logger';
import { LlmRouter } from './router.js';

export function main(): void {
  // 1. Fail-fast env parse: GROQ_API_KEY + GITHUB_TOKEN required (env schema enforces).
  // Throws before any gateway client constructs — no partial traffic.
  const env = parseEnv();

  // 2. Redacting logger: provider keys are in REDACT_PATHS, never logged in plaintext.
  const log = createLogger(env.LOG_LEVEL);

  // 3. LlmRouter constructor — validates ladder (assertNoCerebras), builds adapters.
  const router = new LlmRouter();

  // 4. One JSON boot line: tier counts + cerebras: false (D-04 enforcement).
  const tier1 = router.getLadderConfig().tier1.length;
  const tier2 = router.getLadderConfig().tier2.length;
  log.info(
    { component: 'gateway', tier1, tier2, cerebras: false },
    'gateway boot ok',
  );

  log.flush();
}

main();
