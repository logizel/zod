import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all job adapters + boards before importing index
vi.mock('./greenhouse.js', () => ({ list: vi.fn() }));
vi.mock('./lever.js', () => ({ list: vi.fn() }));
vi.mock('./ashby.js', () => ({ list: vi.fn() }));
vi.mock('./hn-whoshiring.js', () => ({ list: vi.fn() }));
vi.mock('./startup-jobs.js', () => ({ list: vi.fn() }));
vi.mock('./cutshort.js', () => ({ list: vi.fn() }));
vi.mock('./cuvette.js', () => ({ list: vi.fn() }));
vi.mock('./workday.js', () => ({ list: vi.fn() }));
vi.mock('./boards.js', () => ({
  loadBoards: vi.fn(),
  learnBoard: vi.fn(),
  SEED_BOARDS: [],
}));

import { getJobCandidates, JOB_LIST_FNS } from './index.js';
import { list as listGreenhouse } from './greenhouse.js';
import { list as listLever } from './lever.js';
import { list as listAshby } from './ashby.js';
import { list as listHn } from './hn-whoshiring.js';
import { list as listStartupJobs } from './startup-jobs.js';
import { list as listCutshort } from './cutshort.js';
import { list as listCuvette } from './cuvette.js';
import { list as listWorkday } from './workday.js';
import { loadBoards, learnBoard } from './boards.js';

const mGH = vi.mocked(listGreenhouse);
const mLev = vi.mocked(listLever);
const mAsh = vi.mocked(listAshby);
const mHn = vi.mocked(listHn);
const mSJ = vi.mocked(listStartupJobs);
const mCS = vi.mocked(listCutshort);
const mCV = vi.mocked(listCuvette);
const mWD = vi.mocked(listWorkday);
const mLoadBoards = vi.mocked(loadBoards);
const mLearnBoard = vi.mocked(learnBoard);

function mockAllEmpty() {
  mGH.mockResolvedValue([]);
  mLev.mockResolvedValue([]);
  mAsh.mockResolvedValue([]);
  mHn.mockResolvedValue([]);
  mSJ.mockResolvedValue([]);
  mCS.mockResolvedValue([]);
  mCV.mockResolvedValue([]);
  mWD.mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAllEmpty();
  mLoadBoards.mockReturnValue([]);
  mLearnBoard.mockResolvedValue(true);
});

describe('getJobCandidates (index fan-out)', () => {
  it('fans out all 8 sources and merges candidates', async () => {
    mGH.mockResolvedValueOnce([{ url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'GH Job', snippet: '...' }]);
    mLev.mockResolvedValueOnce([{ url: 'https://jobs.lever.co/acme/1', title: 'Lever Job', snippet: '...' }]);

    const result = await getJobCandidates();

    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(result[1].url).toBe('https://jobs.lever.co/acme/1');
    // All 8 JOB_LIST_FNS invoked
    expect(mGH).toHaveBeenCalledTimes(1);
    expect(mLev).toHaveBeenCalledTimes(1);
    expect(mAsh).toHaveBeenCalledTimes(1);
    expect(mHn).toHaveBeenCalledTimes(1);
    expect(mSJ).toHaveBeenCalledTimes(1);
    expect(mCS).toHaveBeenCalledTimes(1);
    expect(mCV).toHaveBeenCalledTimes(1);
    expect(mWD).toHaveBeenCalledTimes(1);
  });

  it('deduplicates by URL across sources', async () => {
    const dup = 'https://jobs.lever.co/shared/1';
    mGH.mockResolvedValueOnce([{ url: dup, title: 'Job A', snippet: '...' }]);
    mLev.mockResolvedValueOnce([{ url: dup, title: 'Job B', snippet: '...' }]);

    const result = await getJobCandidates();

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(dup);
    expect(result[0].title).toBe('Job A'); // first occurrence wins
  });

  it('returns empty array when all sources return empty', async () => {
    const result = await getJobCandidates();
    expect(result).toEqual([]);
  });

  it('is deterministic — stable ordering across repeated runs', async () => {
    mGH.mockResolvedValue([{ url: 'https://boards.greenhouse.io/a/1', title: 'A', snippet: '...' }]);
    mLev.mockResolvedValue([{ url: 'https://jobs.lever.co/b/1', title: 'B', snippet: '...' }]);

    const r1 = await getJobCandidates();
    const r2 = await getJobCandidates();

    expect(r1.map((c) => c.url)).toEqual(r2.map((c) => c.url));
  });

  it('learned boards fan out through provider adapters with slug tokens', async () => {
    mLoadBoards.mockReturnValue([
      { provider: 'lever', slug: 'learnedco' },
      { provider: 'ashby', slug: 'learnedashby' },
      { provider: 'greenhouse', slug: 'learnedgh' },
    ]);

    await getJobCandidates();

    // Lever learned board called with site=learnedco
    expect(mLev).toHaveBeenCalledWith({ site: 'learnedco' });
    // Ashby learned board called with board=learnedashby
    expect(mAsh).toHaveBeenCalledWith({ board: 'learnedashby' });
    // Greenhouse learned board called with board=learnedgh
    expect(mGH).toHaveBeenCalledWith({ board: 'learnedgh' });
  });

  it('learnBoard harvests ATS board URLs from candidate URLs', async () => {
    mGH.mockResolvedValueOnce([
      { url: 'https://boards.greenhouse.io/harvestedco/jobs/1', title: 'Harvested', snippet: '...' },
    ]);

    await getJobCandidates();

    expect(mLearnBoard).toHaveBeenCalledWith('https://boards.greenhouse.io/harvestedco/jobs/1');
  });

  it('non-ATS URLs do not trigger learnBoard', async () => {
    mGH.mockResolvedValueOnce([
      { url: 'https://example.com/jobs/123', title: 'Non-ATS', snippet: '...' },
    ]);

    await getJobCandidates();

    expect(mLearnBoard).toHaveBeenCalledWith('https://example.com/jobs/123');
    // learnBoard returns false for non-ATS, so nothing learned — but the call happens
  });

  it('learned-during-call boards excluded from current call fan-out', async () => {
    // Call 1: no learned boards, but a candidate links to a new ATS board
    mGH.mockResolvedValueOnce([
      { url: 'https://boards.greenhouse.io/newlearned/jobs/1', title: 'New Board Job', snippet: '...' },
    ]);
    mLoadBoards.mockReturnValue([]);

    const result1 = await getJobCandidates();
    expect(result1).toHaveLength(1);
    expect(result1[0].url).toBe('https://boards.greenhouse.io/newlearned/jobs/1');
    // Harvest: learnBoard called
    expect(mLearnBoard).toHaveBeenCalledWith('https://boards.greenhouse.io/newlearned/jobs/1');

    // Call 2: newlearned is now in learned boards → fanned out through greenhouse adapter
    mLoadBoards.mockReturnValue([{ provider: 'greenhouse', slug: 'newlearned' }]);
    mGH.mockResolvedValueOnce([
      { url: 'https://boards.greenhouse.io/newlearned/jobs/2', title: 'Learned Fan-out', snippet: '...' },
    ]);

    const result2 = await getJobCandidates();
    expect(result2).toHaveLength(1);
    expect(result2[0].title).toBe('Learned Fan-out');
    expect(mGH).toHaveBeenLastCalledWith({ board: 'newlearned' });
  });

  it('JOB_LIST_FNS contains all 8 source adapters', () => {
    expect(JOB_LIST_FNS).toHaveLength(8);
  });
});
