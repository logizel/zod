import { describe, expect, it } from 'vitest';
import { isLengthViolation } from './groq.js';

describe('Groq error classification', () => {
  it('treats HTTP 413 as a length violation', () => {
    expect(isLengthViolation({ status: 413 })).toBe(true);
  });

  it('does not treat a 404 model-not-found as a length violation', () => {
    expect(isLengthViolation({ status: 404 })).toBe(false);
  });

  it('does not treat a 401/429 as a length violation', () => {
    expect(isLengthViolation({ status: 401 })).toBe(false);
    expect(isLengthViolation({ status: 429 })).toBe(false);
  });

  it('does not infer a length violation from missing headers', () => {
    expect(isLengthViolation({ headers: { get: () => null } })).toBe(false);
  });
});
