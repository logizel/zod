// One-command local verification (261020-nea).
//
// Runs every local gate sequentially from the repo root:
//   1. build @zod/dashboard-server
//   2. root test suite (pnpm test)
//   3. @zod/dashboard-server test suite
//   4. @zod/db-hot scripts typecheck
//   5. every infra/oracle/drills/*.sh (except browser-soak.sh) in --local mode
//   6. infra/oracle/rebuild.sh --dry-run
//   7. (--soak only) infra/oracle/drills/browser-soak.sh --local
//
// Failures do not stop the run: the summary lists every PASS/FAIL step and the
// process exits 1 when any step failed.
//
// node: built-ins only — no dependencies.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRILLS_DIR = resolve(ROOT, 'infra/oracle/drills');
const REBUILD_SCRIPT = resolve(ROOT, 'infra/oracle/rebuild.sh');

function drillSteps() {
  return readdirSync(DRILLS_DIR)
    .filter((name) => name.endsWith('.sh') && name !== 'browser-soak.sh')
    .sort()
    .map((name) => ({
      label: `drill: ${name}`,
      command: 'bash',
      args: [resolve(DRILLS_DIR, name), '--local'],
    }));
}

function buildSteps(soak) {
  const steps = [
    {
      label: 'build @zod/dashboard-server',
      command: 'pnpm',
      args: ['--filter', '@zod/dashboard-server', 'build'],
    },
    { label: 'test (root)', command: 'pnpm', args: ['test'] },
    {
      label: 'test @zod/dashboard-server',
      command: 'pnpm',
      args: ['--filter', '@zod/dashboard-server', 'test'],
    },
    {
      label: 'typecheck @zod/db-hot scripts',
      command: 'pnpm',
      args: ['--filter', '@zod/db-hot', 'typecheck:scripts'],
    },
    ...drillSteps(),
    { label: 'rebuild.sh --dry-run', command: 'bash', args: [REBUILD_SCRIPT, '--dry-run'] },
  ];
  if (soak) {
    steps.push({
      label: 'drill: browser-soak.sh (--soak)',
      command: 'bash',
      args: [resolve(DRILLS_DIR, 'browser-soak.sh'), '--local'],
    });
  }
  return steps;
}

function printUsage(stream = process.stdout) {
  const steps = buildSteps(false);
  stream.write(`Usage: pnpm verify:local [options]

Runs the local verification gates sequentially from the repo root:
${steps.map((step, index) => `  ${index + 1}. ${step.label}`).join('\n')}

Options:
  --soak   also run the 5-minute local browser soak (drill 7)
  --help   show this help
`);
}

function parseArgs(argv) {
  const options = { soak: false };
  for (const arg of argv) {
    if (arg === '--soak') {
      options.soak = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      printUsage(process.stderr);
      process.exit(2);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const steps = buildSteps(options.soak);
  const results = [];

  for (const [index, step] of steps.entries()) {
    process.stdout.write(`\n[${index + 1}/${steps.length}] ${step.label}\n`);
    const startedAt = Date.now();
    const result = spawnSync(step.command, step.args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false,
    });
    const durationMs = Date.now() - startedAt;

    let passed = result.status === 0;
    let detail = '';
    if (result.error) {
      passed = false;
      detail = result.error.message;
    } else if (result.signal) {
      passed = false;
      detail = `terminated by ${result.signal}`;
    } else if (!passed) {
      detail = `exit ${result.status ?? 'unknown'}`;
    }

    results.push({ label: step.label, passed, durationMs, detail });
  }

  process.stdout.write('\n=== verify:local summary ===\n');
  for (const result of results) {
    const seconds = (result.durationMs / 1000).toFixed(1).padStart(6, ' ');
    const status = result.passed ? 'PASS' : 'FAIL';
    const detail = result.detail ? ` — ${result.detail}` : '';
    process.stdout.write(`${status}  ${seconds}s  ${result.label}${detail}\n`);
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
