// PocketBase hot client (D-09, D-10-client, D-13, D-14-corrected).
//
// Single shared client per process: EventSource polyfill assigned before any
// realtime call, AsyncAuthStore persisting the shared service-account token
// to an owner-only (0600) file loaded as initial state at boot, then
// authWithPassword against the `_superusers` collection.
//
// Secrets hygiene (T-1-04): the token file is created 0600, credentials are
// never logged (the @zod/logger redact paths cover service passwords), and
// the PB server bind itself (loopback-only) is proven by the plan 04
// port-scan drill — this module owns client + schemas + realtime readiness
// only. Live SSE boards are deferred to Phase 7 (D-22).

import PocketBase, { AsyncAuthStore } from 'pocketbase';
import { EventSource } from 'eventsource';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Env } from '@zod/config';

export type HotEnv = Pick<Env, 'PB_URL' | 'PB_SERVICE_EMAIL' | 'PB_SERVICE_PASSWORD'>;

/** Minimal fetch surface the client needs (injectable for mocked tests). */
export interface FetchLikeResponse {
  readonly status: number;
  readonly url: string;
  json(): Promise<unknown>;
}
export interface FetchLike {
  (url: string, init?: Record<string, unknown>): Promise<FetchLikeResponse>;
}

export interface PbClientOptions {
  /** Owner-only token file. Default: ./.pb-service-token.json (gitignored). */
  tokenFile?: string;
  /** Fetch implementation (default: global fetch). Tests inject a mock. */
  fetchImpl?: FetchLike;
}

const DEFAULT_TOKEN_FILE = join(process.cwd(), '.pb-service-token.json');

/** Assign the EventSource polyfill exactly once, before any realtime call. */
export function ensureEventSource(): void {
  if (globalThis.EventSource === undefined) {
    globalThis.EventSource = EventSource as unknown as typeof globalThis.EventSource;
  }
}

/** Load the persisted service-account state, if a previous boot saved one. */
export function loadTokenInitial(tokenFile: string): string | undefined {
  try {
    return readFileSync(tokenFile, 'utf8');
  } catch {
    return undefined;
  }
}

/** Build the shared-service-account store: 0600 file, initial load at boot. */
export function createTokenStore(tokenFile: string): AsyncAuthStore {
  return new AsyncAuthStore({
    save: async (serialized: string) => {
      mkdirSync(dirname(tokenFile), { recursive: true });
      writeFileSync(tokenFile, serialized, { mode: 0o600 });
    },
    initial: loadTokenInitial(tokenFile),
  });
}

/**
 * Construct the hot client and authenticate the shared service account.
 * The caller owns `env` (already gated by parseEnv at the entrypoint).
 */
export async function createPbClient(
  env: HotEnv,
  options: PbClientOptions = {},
): Promise<PocketBase> {
  ensureEventSource();
  const tokenFile = options.tokenFile ?? DEFAULT_TOKEN_FILE;
  const store = createTokenStore(tokenFile);
  const pb = new PocketBase(env.PB_URL, store);
  const authOptions: Record<string, unknown> = {};
  if (options.fetchImpl !== undefined) authOptions['fetch'] = options.fetchImpl;
  await pb
    .collection('_superusers')
    .authWithPassword(env.PB_SERVICE_EMAIL, env.PB_SERVICE_PASSWORD, authOptions);
  return pb;
}
