// One-command local stack (261020-nea).
//
// Starts, from the repo root:
//   PocketBase      127.0.0.1:8090  (--dir ./pb_data)
//   bootstrap       schema + dev seed (idempotent, --seed unless --no-seed)
//   dashboard      127.0.0.1:3000  (built, then started)
//   dashboard proxy 127.0.0.1:8080 (open this in a browser)
//   scheduler      pnpm dev:scheduler (unless --no-scheduler)
//
// One shutdown path: Ctrl-C (SIGINT) or SIGTERM stops every child process
// group; an unexpected child exit stops the rest with a nonzero exit code.
//
// node: built-ins only — no workspace imports, no dependencies.
import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');
const PB_DATA_PATH = resolve(ROOT, 'pb_data');
const PB_DATA_DB_PATH = resolve(PB_DATA_PATH, 'data.db');
const PROXY_SCRIPT = resolve(ROOT, 'scripts/dev-dashboard-proxy.mjs');
const DASHBOARD_ENTRY = resolve(ROOT, 'apps/dashboard-server/dist/index.js');
const OWNER_FALLBACK = 'owner@example.com';
const PORTS = [8090, 3000, 8080];
const IS_WINDOWS = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function logError(message) {
  process.stderr.write(`[dev] ${message}\n`);
}

function printUsage(stream = process.stdout) {
  stream.write(`Usage: pnpm dev [options]

Starts the local Zod stack from the repo root:
  PocketBase        http://127.0.0.1:8090  (--dir ./pb_data)
  bootstrap         idempotent schema + dev seed
  dashboard server  http://127.0.0.1:3000
  dashboard proxy   http://127.0.0.1:8080  <- open this URL
  scheduler         pnpm dev:scheduler

Options:
  --no-seed        skip the dev seed rows (schema is still applied)
  --no-scheduler   do not start the scheduler
  --help           show this help

Ctrl-C stops all services.
`);
}

class StartupError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { seed: true, scheduler: true };
  for (const arg of argv) {
    if (arg === '--no-seed') {
      opts.seed = false;
    } else if (arg === '--no-scheduler') {
      opts.scheduler = false;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      logError(`Unknown option: ${arg}`);
      printUsage(process.stderr);
      process.exit(2);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function findOnPath(command) {
  const dirs = (process.env.PATH ?? '').split(IS_WINDOWS ? ';' : ':');
  const extensions = IS_WINDOWS ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = resolve(dir, command + extension);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

function probePort(port) {
  return new Promise((resolvePromise) => {
    const probe = createNetServer();
    probe.unref();
    probe.once('error', (error) => {
      resolvePromise({ free: false, code: error?.code ?? 'UNKNOWN' });
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolvePromise({ free: true }));
    });
  });
}

/** Parse KEY=VALUE lines; blank lines and # comments are skipped, one layer of
 *  surrounding quotes is stripped. Values are never printed. */
function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    if (key) out[key] = value;
  }
  return out;
}

/** process env wins over .env, then the caller's fallback. Never logs. */
function resolveSetting(key, fileEnv, fallback = '') {
  for (const candidate of [process.env[key], fileEnv[key]]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return fallback;
}

async function waitForHttp(url, label, timeoutMs = 30000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'no response';
  while (Date.now() < deadline) {
    if (shuttingDown) throw new Error('shutdown in progress');
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(2000),
      });
      lastStatus = `HTTP ${response.status}`;
      await response.arrayBuffer().catch(() => {});
      if (response.status === 200) return;
    } catch (error) {
      lastStatus = error?.name === 'TimeoutError' ? 'timeout' : 'connection refused';
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `${label} did not become ready within ${Math.round(timeoutMs / 1000)}s (last: ${lastStatus}).`,
  );
}

// ---------------------------------------------------------------------------
// Child process supervision
// ---------------------------------------------------------------------------

/** @type {Array<{name: string, child: import('node:child_process').ChildProcess, exited: boolean, exitPromise: Promise<void>, resolveExit: () => void, flush: () => void}>} */
const children = [];
let shuttingDown = false;
let shutdownPromise = null;

function startChild(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    // POSIX: one process group per child so shutdown reaches grandchildren
    // (pnpm -> tsx -> scheduler) with a single group signal.
    detached: !IS_WINDOWS,
  });

  let resolveExit;
  const exitPromise = new Promise((resolvePromise) => {
    resolveExit = resolvePromise;
  });

  const entry = {
    name,
    child,
    exited: false,
    exitPromise,
    resolveExit: () => resolveExit(),
    flush: () => {},
  };

  const emit = (line, stream) => {
    const text = `[${name}] ${line}\n`;
    if (stream === 'stderr') process.stderr.write(text);
    else process.stdout.write(text);
  };

  const attach = (stream, which) => {
    if (!stream) return () => {};
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        emit(line, which);
        newline = buffer.indexOf('\n');
      }
    });
    stream.on('end', () => {
      if (buffer.length > 0) {
        emit(buffer.replace(/\r$/, ''), which);
        buffer = '';
      }
    });
    return () => {
      if (buffer.length > 0) {
        emit(buffer.replace(/\r$/, ''), which);
        buffer = '';
      }
    };
  };

  const flushStdout = attach(child.stdout, 'stdout');
  const flushStderr = attach(child.stderr, 'stderr');
  entry.flush = () => {
    flushStdout();
    flushStderr();
  };

  child.on('error', (error) => {
    if (shuttingDown) return;
    logError(`[${name}] failed to start: ${error?.message ?? String(error)}`);
    void shutdown(1);
  });

  child.on('exit', (code, signal) => {
    entry.exited = true;
    entry.resolveExit();
    if (shuttingDown) return;
    const exitCode = typeof code === 'number' && code !== 0 ? code : 1;
    logError(`[${name}] exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'})`);
    void shutdown(exitCode);
  });

  child.on('close', () => {
    entry.flush();
  });

  children.push(entry);
  return entry;
}

async function waitForExit(entry, timeoutMs) {
  if (entry.exited) return true;
  return Promise.race([
    entry.exitPromise.then(() => true),
    sleep(timeoutMs).then(() => entry.exited),
  ]);
}

async function stopChild(entry) {
  if (entry.exited || !entry.child.pid) return;
  const pid = entry.child.pid;

  const signalGroup = (signal) => {
    if (IS_WINDOWS) {
      try {
        entry.child.kill(signal);
      } catch {
        // already gone
      }
      return;
    }
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        entry.child.kill(signal);
      } catch {
        // already gone
      }
    }
  };

  signalGroup('SIGTERM');
  if (await waitForExit(entry, 5000)) return;

  log(`[${entry.name}] did not stop after SIGTERM — sending SIGKILL`);
  signalGroup('SIGKILL');
  await waitForExit(entry, 2000);
}

/**
 * Reentrancy-guarded shutdown: SIGTERM each process group, wait up to 5s per
 * child, SIGKILL survivors, then exit. All startup failures and unexpected
 * exits route here.
 */
function shutdown(code = 0) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    if (children.length > 0) log('stopping services...');
    for (const entry of children) entry.flush();
    await Promise.all(children.map((entry) => stopChild(entry)));
    for (const entry of children) entry.flush();
    // Give stdout/stderr a tick to drain before the forced exit.
    await sleep(50);
    process.exit(code);
  })();
  return shutdownPromise;
}

process.on('SIGINT', () => {
  void shutdown(0);
});
process.on('SIGTERM', () => {
  void shutdown(0);
});
process.on('uncaughtException', (error) => {
  logError(`uncaught exception: ${error instanceof Error ? error.message : String(error)}`);
  void shutdown(1);
});
process.on('unhandledRejection', (reason) => {
  logError(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  void shutdown(1);
});

// ---------------------------------------------------------------------------
// Startup steps
// ---------------------------------------------------------------------------

async function preflight() {
  const problems = [];

  const nodeMajor = Number((process.versions.node ?? '0').split('.')[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
    problems.push(
      `Node ${process.versions.node} is too old — Node.js 22 or newer is required.`,
    );
  }

  const pnpmPath = findOnPath('pnpm');
  if (!pnpmPath) {
    problems.push('`pnpm` was not found on PATH — install pnpm 10 and re-run.');
  }

  const pocketbasePath = findOnPath('pocketbase');
  if (!pocketbasePath) {
    problems.push(
      '`pocketbase` was not found on PATH — install PocketBase 0.40.x and re-run.',
    );
  }

  if (!existsSync(ENV_PATH)) {
    problems.push(
      '`.env` is missing — run `cp .env.example .env` and fill in the required credentials.',
    );
  }

  const busyPorts = [];
  for (const port of PORTS) {
    const result = await probePort(port);
    if (!result.free) busyPorts.push(port);
  }
  if (busyPorts.length > 0) {
    problems.push(
      `port${busyPorts.length > 1 ? 's' : ''} ${busyPorts.join(', ')} already in use on 127.0.0.1 — stop the existing process and re-run.`,
    );
  }

  if (problems.length > 0) throw new StartupError(problems);
  return { pnpmPath, pocketbasePath };
}

async function initSuperuserIfNeeded(pocketbasePath, fileEnv) {
  if (existsSync(PB_DATA_DB_PATH)) {
    // Existing data: never create or modify superusers. A credential mismatch
    // surfaces at bootstrap and is reported — never worked around by deleting
    // pb_data.
    return;
  }

  const email = resolveSetting('PB_SERVICE_EMAIL', fileEnv);
  const password = resolveSetting('PB_SERVICE_PASSWORD', fileEnv);
  if (!email || !password) {
    throw new Error(
      'pb_data/data.db is missing and PB_SERVICE_EMAIL / PB_SERVICE_PASSWORD are not set — add both to .env (see .env.example) so the PocketBase superuser can be created.',
    );
  }

  log('pb_data/data.db not found — creating the PocketBase superuser');
  const result = spawnSync(
    pocketbasePath,
    ['superuser', 'create', email, password, '--dir', './pb_data'],
    { cwd: ROOT, encoding: 'utf8' },
  );

  if (result.error) {
    throw new Error(`could not run pocketbase superuser create: ${result.error.message}`);
  }
  if (result.status !== 0) {
    // Diagnostics only — redact both values before printing anything.
    const raw = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const redacted = raw.split(email).join('<redacted-email>').split(password).join('<redacted-password>');
    const lastLine = redacted.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
    throw new Error(
      `could not create the PocketBase superuser (exit ${result.status ?? 'unknown'}).${lastLine ? ` ${lastLine}` : ''}`,
    );
  }
}

function runInherited(label, command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 'unknown'}).`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const { pnpmPath, pocketbasePath } = await preflight();
  const fileEnv = parseEnvFile(readFileSync(ENV_PATH, 'utf8'));
  const owner = resolveSetting('ACCESS_OWNER_EMAIL', fileEnv, OWNER_FALLBACK);
  const childEnv = { ACCESS_OWNER_EMAIL: owner };

  await initSuperuserIfNeeded(pocketbasePath, fileEnv);

  log('starting PocketBase on 127.0.0.1:8090');
  startChild(
    'pb',
    pocketbasePath,
    ['serve', '--http', '127.0.0.1:8090', '--dir', './pb_data'],
    childEnv,
  );
  await waitForHttp('http://127.0.0.1:8090/api/health', 'PocketBase');
  log('PocketBase ready');

  const bootstrapArgs = ['exec', 'tsx', 'packages/db-hot/scripts/bootstrap-pb.ts'];
  if (options.seed) bootstrapArgs.push('--seed');
  log(options.seed ? 'applying schema and dev seed' : 'applying schema (seed skipped)');
  try {
    runInherited('bootstrap', pnpmPath, bootstrapArgs);
  } catch (error) {
    throw new Error(
      `${error.message} If this is an authentication error, PB_SERVICE_EMAIL / PB_SERVICE_PASSWORD in .env must match the existing pb_data; do not delete pb_data.`,
    );
  }

  // The root `pnpm build` is a known pre-existing failure (discord-router /
  // scheduler TS5055 project cycle + orchestrator fixture drift). Local dev
  // intentionally builds only @zod/dashboard-server.
  log('building @zod/dashboard-server');
  runInherited('dashboard build', pnpmPath, ['--filter', '@zod/dashboard-server', 'build']);

  log('starting the dashboard server on 127.0.0.1:3000');
  startChild('dashboard', process.execPath, [DASHBOARD_ENTRY], childEnv);
  // 503 means PocketBase auth/upstream is not ready yet — retry, do not fail.
  await waitForHttp('http://127.0.0.1:3000/api/boards', 'dashboard server');
  log('dashboard server ready');

  log('starting the dashboard proxy on 127.0.0.1:8080');
  startChild('proxy', process.execPath, [PROXY_SCRIPT], childEnv);
  await waitForHttp('http://127.0.0.1:8080/', 'dashboard proxy');
  log('dashboard proxy ready');

  if (options.scheduler) {
    log('starting the scheduler');
    const scheduler = startChild('scheduler', pnpmPath, ['dev:scheduler'], childEnv);
    await sleep(1000);
    if (scheduler.exited) {
      throw new Error('scheduler exited during startup — see the [scheduler] log lines above.');
    }
  }

  process.stdout.write('READY → http://127.0.0.1:8080\n');
  process.stdout.write('Ctrl-C stops all services.\n');
}

main().catch(async (error) => {
  if (error instanceof StartupError) {
    for (const problem of error.problems) logError(problem);
  } else {
    logError(error instanceof Error ? error.message : String(error));
  }
  await shutdown(1);
});
