import { describe, expect, it } from 'vitest';
import { parseLlmJson } from './json.js';

describe('parseLlmJson', () => {
  it('parses a bare JSON object', () => {
    expect(parseLlmJson('{"verdict":"ok"}')).toEqual({ verdict: 'ok' });
  });

  it('parses a fenced ```json block', () => {
    expect(parseLlmJson('```json\n{"verdict":"ok","score":91}\n```')).toEqual({
      verdict: 'ok',
      score: 91,
    });
  });

  it('parses a plain fenced block', () => {
    expect(parseLlmJson('```\n{"verdict":"ok"}\n```')).toEqual({ verdict: 'ok' });
  });

  it('parses JSON wrapped in prose', () => {
    expect(
      parseLlmJson('Here is the verdict:\n{"verdict":"ok","score":88}\nHope that helps!'),
    ).toEqual({ verdict: 'ok', score: 88 });
  });

  it('parses the first balanced object even when prose contains braces', () => {
    expect(parseLlmJson('Note {not json}. Verdict: {"verdict":"ok"}')).toEqual({
      verdict: 'ok',
    });
  });

  it('handles braces and escaped quotes inside string values', () => {
    expect(parseLlmJson('{"summary":"use {braces} and \\"quotes\\" safely"}')).toEqual({
      summary: 'use {braces} and "quotes" safely',
    });
  });

  it('parses a JSON array', () => {
    expect(parseLlmJson('Result: [{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('returns null for non-JSON output', () => {
    expect(parseLlmJson('UNVERIFIED')).toBeNull();
    expect(parseLlmJson('POOL_SATURATED')).toBeNull();
    expect(parseLlmJson('{ broken')).toBeNull();
    expect(parseLlmJson('')).toBeNull();
    expect(parseLlmJson(undefined)).toBeNull();
    expect(parseLlmJson({ verdict: 'already parsed' })).toBeNull();
  });
});
