// Robust JSON extraction for LLM responses.
//
// Models frequently wrap verdicts in markdown fences (```json ... ```) or add
// a sentence of prose before/after the object. The router needs the verdict,
// not a strict "response is JSON" guarantee. `parseLlmJson` tries, in order:
//   1. JSON.parse of the whole trimmed response
//   2. JSON.parse of each fenced block
//   3. the first balanced {...} / [...] substring found in the prose
// Returns null when nothing parses — callers decide whether to stitch/fallback.

export function parseLlmJson(text: unknown): unknown | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = tryParse(trimmed);
  if (direct.ok) return direct.value;

  // Fenced blocks: ```json {...} ``` or plain ``` {...} ```.
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/giu;
  for (const match of trimmed.matchAll(fenceRe)) {
    const parsed = tryParse(match[1].trim());
    if (parsed.ok) return parsed.value;
  }

  // Prose-wrapped JSON: scan for a balanced object/array and parse it.
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch !== '{' && ch !== '[') continue;
    const close = ch === '{' ? '}' : ']';
    const candidate = extractBalanced(trimmed, i, ch, close);
    if (candidate === null) continue;
    const parsed = tryParse(candidate);
    if (parsed.ok) return parsed.value;
  }

  return null;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Slice a balanced JSON object/array starting at `start`, ignoring braces
 * inside string literals and escaped quotes.
 */
function extractBalanced(
  text: string,
  start: number,
  open: string,
  close: string,
): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
