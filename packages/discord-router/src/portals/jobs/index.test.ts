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
vi.mock('./yc.js', () => ({ list: vi.fn() }));
vi.mock('./wellfound.js', () => ({ list: vi.fn() }));
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
import { list as listYc } from './yc.js';
import { list as listWellfound } from './wellfound.js';
import { loadBoards, learnBoard } from './boards.js';

const mGH = vi.mocked(listGreenhouse);
const mLev = vi.mocked(listLever);
const mAsh = vi.mocked(listAshby);
const mHn = vi.mocked(listHn);
const mSJ = vi.mocked(listStartupJobs);
const mCS = vi.mocked(listCutshort);
const mCV = vi.mocked(listCuvette);
const mWD = vi.mocked(listWorkday);
const mYC = vi.mocked(listYc);
const mWF = vi.mocked(listWellfound);
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
  mYC.mockResolvedValue([]);
  mWF.mockResolvedValue([]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAllEmpty();
  mLoadBoards.mockReturnValue([]);
  mLearnBoard.mockResolvedValue(true);
});

describe('getJobCandidates (index fan-out)', () => {
  it('fans out all 10 sources and merges candidates', async () => {
    mGH.mockResolvedValueOnce([{ url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'GH Job', snippet: '...' }]);
    mLev.mockResolvedValueOnce([{ url: 'https://jobs.lever.co/acme/1', title: 'Lever Job', snippet: '...' }]);
    mYC.mockResolvedValueOnce([{ url: 'https://wellfound.com/company/acme/jobs/1', title: 'YC Job', snippet: '...' }]);
    mWF.mockResolvedValueOnce([{ url: 'https://wellfound.com/company/other/jobs/2', title: 'WF Job', snippet: '...' }]);

    const result = await getJobCandidates();

    expect(result).toHaveLength(4);
    expect(result[0].url).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(result[1].url).toBe('https://jobs.lever.co/acme/1');
    expect(result[2].url).toBe('https://wellfound.com/company/acme/jobs/1');
    expect(result[3].url).toBe('https://wellfound.com/company/other/jobs/2');
    // All 10 JOB_LIST_FNS invoked
    expect(mGH).toHaveBeenCalledTimes(1);
    expect(mLev).toHaveBeenCalledTimes(1);
    expect(mAsh).toHaveBeenCalledTimes(1);
    expect(mHn).toHaveBeenCalledTimes(1);
    expect(mSJ).toHaveBeenCalledTimes(1);
    expect(mCS).toHaveBeenCalledTimes(1);
    expect(mCV).toHaveBeenCalledTimes(1);
    expect(mWD).toHaveBeenCalledTimes(1);
    expect(mYC).toHaveBeenCalledTimes(1);
    expect(mWF).toHaveBeenCalledTimes(1);
  });

  it('deduplicates by URL across all 10 sources', async () => {
    const dup = 'https://jobs.lever.co/shared/1';
    mGH.mockResolvedValueOnce([{ url: dup, title: 'Job A', snippet: '...' }]);
    mLev.mockResolvedValueOnce([{ url: dup, title: 'Job B', snippet: '...' }]);
    mYC.mockResolvedValueOnce([{ url: dup, title: 'Job C', snippet: '...' }]);

    const result = await getJobCandidates();

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(dup);
    expect(result[0].title).toBe('Job A'); // first occurrence wins (source-table order)
  });

  it('returns empty array when all sources return empty', async () => {
    const result = await getJobCandidates();
    expect(result).toEqual([]);
  });

  it('is deterministic — stable ordering across repeated runs', async () => {
    mGH.mockResolvedValue([{ url: 'https://boards.greenhouse.io/a/1', title: 'A', snippet: '...' }]);
    mLev.mockResolvedValue([{ url: 'https://jobs.lever.co/b/1', title: 'B', snippet: '...' }]);
    mYC.mockResolvedValue([{ url: 'https://wellfound.com/c/1', title: 'C', snippet: '...' }]);
    mWF.mockResolvedValue([{ url: 'https://wellfound.com/d/1', title: 'D', snippet: '...' }]);

    const r1 = await getJobCandidates();
    const r2 = await getJobCandidates();

    expect(r1.map((c) => c.url)).toEqual(r2.map((c) => c.url));
  });

  it('isolation: yc returning [] never affects the other eight sources', async () => {
    mGH.mockResolvedValueOnce([{ url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'GH Job', snippet: '...' }]);
    mYC.mockResolvedValue([]); // yc returns empty
    mWF.mockResolvedValue([]); // wellfound returns empty

    const result = await getJobCandidates();

    // The other eight sources still ran; only GH produced a candidate
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(mGH).toHaveBeenCalledTimes(1);
    expect(mLev).toHaveBeenCalledTimes(1);
    expect(mAsh).toHaveBeenCalledTimes(1);
    expect(mHn).toHaveBeenCalledTimes(1);
    expect(mSJ).toHaveBeenCalledTimes(1);
    expect(mCS).toHaveBeenCalledTimes(1);
    expect(mCV).toHaveBeenCalledTimes(1);
    expect(mWD).toHaveBeenCalledTimes(1);
    expect(mYC).toHaveBeenCalledTimes(1);
    expect(mWF).toHaveBeenCalledTimes(1);
  });

  it('isolation: wellfound returning [] never throws and leaves others untouched', async () => {
    mGH.mockResolvedValueOnce([{ url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'GH Job', snippet: '...' }]);
    mWF.mockResolvedValue([]);

    const result = await getJobCandidates();

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(mWF).toHaveBeenCalledTimes(1);
  });

  it('learned boards fan out through provider adapters with slug tokens', async () => {
    mLoadBoards.mockReturnValue([
      { provider: 'lever', slug: 'learnedco' },
      { provider: 'ashby', slug: 'learnedashby' },
      { provider: 'greenhouse', slug: 'learnedgh' },
    ]);

    await getJobCandidates();

    expect(mLev).toHaveBeenCalledWith({ site: 'learnedco' });
    expect(mAsh).toHaveBeenCalledWith({ board: 'learnedashby' });
    expect(mGH).toHaveBeenCalledWith({ board: 'learnedgh' });
  });

  it('learnBoard harvests ATS board URLs from candidate URLs', async () => {
    mGH.mockResolvedValueOnce([
      { url: 'https://boards.greenhouse.io/harvestedco/jobs/1', title: 'Harvested', snippet: '...' },
    ]);

    await getJobCandidates();

    expect(mLearnBoard).toHaveBeenCalledWith('https://boards.greenhouse.io/harvestedco/jobs/1');
  });

  it('harvest participation: ATS board link from yc/wellfound candidate is learned exactly once', async () => {
    // yc candidate whose URL carries a Greenhouse board link
    mYC.mockResolvedValueOnce([
      { url: 'https://boards.greenhouse.io/yc-source/jobs/1', title: 'YC Sourced GH Job', snippet: '...' },
    ]);
    // wellfound candidate whose URL carries a Lever board link
    mWF.mockResolvedValueOnce([
      { url: 'https://jobs.lever.co/wf-source/1', title: 'WF Sourced Lever Job', snippet: '...' },
    ]);

    await getJobCandidates();

    // Each ATS board URL passed to learnBoard exactly once
    expect(mLearnBoard).toHaveBeenCalledWith('https://boards.greenhouse.io/yc-source/jobs/1');
    expect(mLearnBoard).toHaveBeenCalledWith('https://jobs.lever.co/wf-source/1');
    expect(mLearnBoard).toHaveBeenCalledTimes(2);
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

  it('JOB_LIST_FNS contains all 10 source adapters', () => {
    expect(JOB_LIST_FNS).toHaveLength(10);
  });
});
