/** Job portal list-fn table + fan-out (mirrors PORTAL_LIST_FNS / getPortalCandidates).
 *
 * All 8 D-01 job sources wired: Greenhouse, Lever, Ashby, HN Who-is-hiring,
 * startup.jobs, Cutshort, Cuvette, Workday. Plus D-02 learned-board fan-out
 * through provider adapters with their slug tokens. URL dedupe applied across
 * all sources inside getJobCandidates().
 *
 * Learned boards are snapshotted at call start: boards learned during this
 * call (via learnBoard harvest) fan out on the NEXT tick.
 */

import { PollCandidate } from '../ctftime.js';
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

/** All job portal adapter list functions (D-01).
 * Ten sources: the 05-02 eight plus YC Work-at-a-Startup + Wellfound
 * (appended here; zero scheduler/registry/.env changes — they ride the
 * existing JOB_POLL_JOBS jobs tick).
 */
export const JOB_LIST_FNS: readonly (() => Promise<PollCandidate[]>)[] = [
  listGreenhouse,
  () => listLever(),
  () => listAshby(),
  () => listHn(),
  () => listStartupJobs(),
  () => listCutshort(),
  () => listCuvette(),
  () => listWorkday(),
  () => listYc(),
  () => listWellfound(),
];

/** Fetch candidates from all job portal adapters plus learned-board fan-out,
 * merged and deduplicated by URL. Harvests ATS board URLs from candidate URLs
 * via learnBoard (fans out on the NEXT tick).
 */
export async function getJobCandidates(): Promise<PollCandidate[]> {
  // Snapshot learned boards at call start (D-02: learned-during-call excluded
  // from current fan-out; they appear on the next tick)
  const boardsSnapshot = loadBoards();

  // 1. Default JOB_LIST_FNS fan-out (all 10 sources)
  const baseResults = await Promise.all(JOB_LIST_FNS.map((fn) => fn()));

  // 2. Learned board fan-out through provider adapters with slug tokens
  const learnedResults = await Promise.all(
    boardsSnapshot.map((board) => {
      switch (board.provider) {
        case 'greenhouse':
          return listGreenhouse({ board: board.slug });
        case 'lever':
          return listLever({ site: board.slug });
        case 'ashby':
          return listAshby({ board: board.slug });
      }
    }),
  );

  // 3. Merge all candidates
  const merged = [...baseResults.flat(), ...learnedResults.flat()];

  // 4. URL dedupe (stable order — first occurrence wins)
  const seen = new Set<string>();
  const deduped = merged.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  // 5. Harvest ATS board URLs from candidate URLs → learnBoard (next tick fan-out)
  await Promise.all(deduped.map((c) => learnBoard(c.url)));

  return deduped;
}
