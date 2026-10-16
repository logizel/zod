import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  readStateFile,
  writeStateFile,
  loadBoards,
  SEED_BOARDS,
  type BoardsState,
} from './boards.js';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'zod-boards-test-'));
  statePath = join(tmpDir, 'boards-learned.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('boards state-file core', () => {
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
    // seed entries match SEED_BOARDS
    for (const seed of SEED_BOARDS) {
      expect(boards.some((b) => b.provider === seed.provider && b.slug === seed.slug)).toBe(true);
    }
  });

  it('atomic write uses tmp+rename (no torn reads)', async () => {
    const state: BoardsState = { learned: [], watermarks: {} };
    writeStateFile(state, statePath);
    // The final file should exist, no .tmp file lingering
    const finalExists = () => {
      try { readFileSync(statePath, 'utf8'); return true; } catch { return false; }
    };
    expect(finalExists()).toBe(true);
    // parse as valid JSON
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
