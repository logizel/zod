// Deterministic jobs gates — the final authority over routing and reject codes.
// Mirrors passesPrizeGate (packages/discord-router/src/prize-gate.ts): pure,
// unit-testable, no I/O.
//
// Stack classifier (JOB-04 / JOB-05):
//   Sys/Cloud/DevOps/SRE/K8s/Rust-Go-C → #⚙️-jobs-sys-cloud-devops
//   every other admitted SWE role        → #💼-jobs-general-swe
//   never an empty bucket value

export const BUCKET_JOBS_SYS_CLOUD = '#⚙️-jobs-sys-cloud-devops';
export const BUCKET_JOBS_GENERAL = '#💼-jobs-general-swe';

const SYS_CLOUD_STACKS = new Set([
  'sys', 'cloud', 'devops', 'sre', 'k8s', 'kubernetes', 'rust', 'go', 'golang',
]);

function isSysCloudStack(tag: string): boolean {
  const t = tag.toLowerCase().trim();
  return SYS_CLOUD_STACKS.has(t);
}

export interface JobsGateResult {
  admitted: boolean;
  reasonCode?: string;
  bucketChannel?: string;
}

/**
 * pickJobsBucket: classify stack tags into a bucket channel.
 * Never returns an empty value — defaults to the general bucket.
 */
export function pickJobsBucket(stackTags: string[]): string {
  for (const tag of stackTags) {
    if (isSysCloudStack(tag)) return BUCKET_JOBS_SYS_CLOUD;
  }
  return BUCKET_JOBS_GENERAL;
}

/**
 * evaluateJobsGates: compose deterministic gates over the LLM verdict + raw text.
 * Returns { admitted, reasonCode, bucketChannel }.
 * Gate rejects win over LLM admits; an LLM reject is honored with its reason code.
 */
export function evaluateJobsGates(
  verdict: { admission_class: string; reason_code: string | null; stack_tags?: string[] },
  _fetchedText: string,
): JobsGateResult {
  // Honor an LLM-level reject first.
  if (verdict.admission_class === 'reject') {
    return {
      admitted: false,
      reasonCode: verdict.reason_code ?? 'rejected',
    };
  }

  // Unverified is not an admit — cannot proceed without a verdict.
  if (verdict.admission_class !== 'admit') {
    return { admitted: false, reasonCode: 'unverified' };
  }

  // Deterministic gate checks would go here (freshness, scam keyword re-scan,
  // geo confirmation) — wired as pure predicates over _fetchedText. For this
  // tracer slice the LLM verdict is the admission authority; gates add the
  // bucket classification on top.
  const bucketChannel = pickJobsBucket(verdict.stack_tags ?? []);

  return {
    admitted: true,
    bucketChannel,
  };
}
