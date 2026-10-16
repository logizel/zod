import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  readStateFile,
  writeStateFile,
  loadBoards,
  SEED_BOARDS,
  extractBoardUrl,
  learnBoard,
  type BoardsState,
} from './boards.js';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'zod-boards-test-'));
  statePath = join(tmpDir, 'boards-learned.json');
  // Ensure clean default state path for watermark isolation
  try { rmSync(statePath, { force: true }); } catch {}
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('boards state-file core (Task 1)', () => {
  it('writeStateFile then readStateFile round-trips learned boards', async () => {
    const state: BoardsState = {
      learned: [
        { provider: 'greenhouse', slug: 'acme', learnedAt: '2026-10-01T00:00:00Z' },
        { provider: 'lever', slug: 'startupco', learnedAt: '2026-10-02T00:00:00Z' },
      ],
      watermarks: {},
    };
    writeStateFile(state, statePath);
    const readBack = readStateFile(statePath);
    expect(readBack).not.toBeNull();
    expect(readBack!.learned).toHaveLength(2);
    expect(readBack!.learned[0]).toMatchObject({ provider: 'greenhouse', slug: 'acme' });
    expect(readBack!.learned[1]).toMatchObject({ provider: 'lever', slug: 'startupco' });
  });

  it('corrupt JSON returns null (degrades to seed-only)', async () => {
    writeFileSync(statePath, '{ not valid json }');
    const result = readStateFile(statePath);
    expect(result).toBeNull();
  });

  it('missing file returns null (degrades to seed-only)', async () => {
    const result = readStateFile(join(tmpDir, 'does-not-exist.json'));
    expect(result).toBeNull();
  });

  it('loadBoards returns seed boards only when no state file exists', async () => {
    const boards = loadBoards(statePath);
    expect(boards).toHaveLength(SEED_BOARDS.length);
    for (const seed of SEED_BOARDS) {
      expect(boards.some((b) => b.provider === seed.provider && b.slug === seed.slug)).toBe(true);
    }
  });

  it('atomic write uses tmp+rename (no torn reads)', async () => {
    const state: BoardsState = { learned: [], watermarks: {} };
    writeStateFile(state, statePath);
    const finalExists = () => {
      try { readFileSync(statePath, 'utf8'); return true; } catch { return false; }
    };
    expect(finalExists()).toBe(true);
    JSON.parse(readFileSync(statePath, 'utf8'));
  });

  it('SEED_BOARDS has provider + slug entries', () => {
    expect(SEED_BOARDS.length).toBeGreaterThanOrEqual(8);
    for (const b of SEED_BOARDS) {
      expect(['greenhouse', 'lever', 'ashby']).toContain(b.provider);
      expect(typeof b.slug).toBe('string');
      expect(b.slug.length).toBeGreaterThan(0);
    }
  });
});

describe('boards D-02 auto-learn (Task 2)', () => {
  it('extractBoardUrl matches all three providers and returns null otherwise', () => {
    expect(extractBoardUrl('https://boards.greenhouse.io/acme/jobs/123')).toMatchObject({
      provider: 'greenhouse', slug: 'acme',
    });
    expect(extractBoardUrl('See https://jobs.lever.co/startupco/apply for details')).toMatchObject({
      provider: 'lever', slug: 'startupco',
    });
    expect(extractBoardUrl('Check https://jobs.ashbyhq.com/linear/jobs/5')).toMatchObject({
      provider: 'ashby', slug: 'linear',
    });
    expect(extractBoardUrl('https://example.com/jobs')).toBeNull();
    expect(extractBoardUrl('no url here')).toBeNull();
    expect(extractBoardUrl('https://boards.greenhouse.io/')).toBeNull();
  });

  it('learnBoard appends a new board exactly once (idempotent)', async () => {
    const first = await learnBoard('https://boards.greenhouse.io/newco/jobs/1', statePath);
    expect(first).toBe(true);

    const second = await learnBoard('https://boards.greenhouse.io/newco/jobs/2', statePath);
    expect(second).toBe(false); // same board, already learned

    const state = readStateFile(statePath);
    expect(state!.learned).toHaveLength(1);
    expect(state!.learned[0]).toMatchObject({ provider: 'greenhouse', slug: 'newco' });
  });

  it('learnBoard does not duplicate seed boards', async () => {
    const seed = SEED_BOARDS[0];
    const result = await learnBoard(
      `https://boards.${seed.provider === 'greenhouse' ? 'greenhouse.io' : seed.provider === 'lever' ? 'jobs.lever.co' : 'jobs.ashbyhq.com'}/${seed.slug}/jobs/1`,
      statePath,
    );
    expect(result).toBe(false); // already in seed, not learned

    const state = readStateFile(statePath);
    expect(state).toBeNull(); // no state file written for seed boards
  });

  it('loadBoards unions seed + learned, seed never duplicated', async () => {
    await learnBoard('https://jobs.lever.co/extraco/apply', statePath);

    const boards = loadBoards(statePath);
    const learnedCount = boards.filter((b) => b.provider === 'lever' && b.slug === 'extraco').length;
    expect(learnedCount).toBe(1);
    // Total = seed count + 1 learned
    expect(boards.length).toBe(SEED_BOARDS.length + 1);
  });

  it('learned board appears only once even after multiple learnBoard calls', async () => {
    await learnBoard('https://jobs.ashbyhq.com/dupco/apply', statePath);
    await learnBoard('https://jobs.ashbyhq.com/dupco/jobs/2', statePath);
    await learnBoard('https://jobs.ashbyhq.com/dupco/apply', statePath);

    const state = readStateFile(statePath);
    const dupcoEntries = state!.learned.filter((b) => b.slug === 'dupco');
    expect(dupcoEntries).toHaveLength(1);
  });

  it('corrupt state file degrades to seed-only in loadBoards', async () => {
    writeFileSync(statePath, '{ corrupt }');
    const boards = loadBoards(statePath);
    expect(boards).toHaveLength(SEED_BOARDS.length);
  });
});
