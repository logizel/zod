// Apply the idempotent cold-ledger DDL (+ empty seed) to Turso.
//
// Usage:
//   node scripts/apply-turso-schema.mjs          # reads .env, then process env
//   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/apply-turso-schema.mjs
//
// Precedence: real process env wins; missing keys are filled from .env. This
// matches the VM, where /etc/zod/env is exported and there is no repo .env.
// Safe to re-run: every statement is CREATE ... IF NOT EXISTS.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(resolve(ROOT, '.env'));

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('apply-turso-schema: TURSO_DATABASE_URL is unset (env or .env)');
  process.exit(1);
}
if (!authToken) {
  console.error('apply-turso-schema: TURSO_AUTH_TOKEN is unset (env or .env)');
  process.exit(1);
}

/** Split the checked-in SQL files the same way rebuild.sh always has. */
function statementsFrom(relativePath) {
  const sql = readFileSync(resolve(ROOT, relativePath), 'utf8');
  return sql
    .split(/;\s*\n/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => {
      if (!stmt) return false;
      // Drop comment-only chunks (seed.sql is intentionally comments only).
      return stmt
        .split('\n')
        .some((line) => line.trim() !== '' && !line.trim().startsWith('--'));
    });
}

const db = createClient({ url, authToken });

for (const file of ['infra/turso/schema.sql', 'infra/turso/seed.sql']) {
  const statements = statementsFrom(file);
  for (const sql of statements) {
    await db.execute(sql);
  }
  console.log(`apply-turso-schema: ${file} applied (${statements.length} statement(s))`);
}

console.log('apply-turso-schema: cold ledger up to date');
