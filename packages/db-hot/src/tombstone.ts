// Idempotent tombstone writes.
//
// The cold tombstone ledger has a unique index on url_hash. Multiple retry
// paths (fetch failures, audit rejects, merge backstop) can legitimately try to
// tombstone the same URL twice; the second write must be a no-op, not a crash.

export interface TombstoneInput {
  url_hash: string;
  fingerprint: string;
  terminal_status: string;
  source: string;
  decided_at: string;
  [key: string]: unknown;
}

interface TombstoneCollection {
  create(data: Record<string, unknown>): Promise<unknown>;
  getFirstListItem?(filter: string, options?: unknown): Promise<unknown>;
}

export interface TombstonePbLike {
  collection(name: string): unknown;
}

function statusOf(err: unknown): number | undefined {
  const e = err as {
    status?: number;
    response?: { code?: number; status?: number };
  } | null;
  return e?.status ?? e?.response?.code ?? e?.response?.status;
}

function isNotFound(err: unknown): boolean {
  return statusOf(err) === 404;
}

function isUniqueViolation(err: unknown): boolean {
  if (statusOf(err) !== 400) return false;
  const e = err as { response?: unknown; message?: string } | null;
  const text = JSON.stringify(e?.response ?? e?.message ?? '');
  return /unique|already exists/i.test(text);
}

/**
 * Create a tombstone unless one already exists for its url_hash.
 * Returns 'created' for a new row, 'exists' for an idempotent no-op.
 */
export async function createTombstoneIfAbsent(
  pb: TombstonePbLike,
  input: TombstoneInput,
): Promise<'created' | 'exists'> {
  const coll = pb.collection('tombstone_ledger') as TombstoneCollection;

  // Pre-check when the client supports filtered reads (real PocketBase does).
  if (typeof coll.getFirstListItem === 'function') {
    try {
      const escaped = input.url_hash.replace(/'/g, "''");
      await coll.getFirstListItem(`url_hash = '${escaped}'`);
      return 'exists';
    } catch (err) {
      // 404 = not present; any other read failure falls through to create.
      if (!isNotFound(err)) {
        // Best effort: let create's unique index be the final arbiter.
      }
    }
  }

  try {
    await coll.create({ ...input });
    return 'created';
  } catch (err) {
    if (isUniqueViolation(err)) return 'exists';
    throw err;
  }
}
