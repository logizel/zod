import { describe, expect, it } from 'vitest';
import { extractPastDate } from './expiry.js';

describe('scout expiry', () => {
  it('returns Date for 15 Nov 2020 (past)', () => {
    expect(extractPastDate('Join us 15 Nov 2020')).toBeInstanceOf(Date);
  });
  it('returns null for 15 Nov 2030 (future)', () => {
    expect(extractPastDate('Join us 15 Nov 2030')).toBeNull();
  });
  it('returns null for TBA', () => {
    expect(extractPastDate('TBA')).toBeNull();
  });
  it('returns null for Coming soon', () => {
    expect(extractPastDate('Coming soon')).toBeNull();
  });
  it('returns Date for ISO 2020-01-15', () => {
    expect(extractPastDate('Deadline 2020-01-15')).toBeInstanceOf(Date);
  });
  it('returns null for ambiguous slash format 15/01/2020', () => {
    expect(extractPastDate('15/01/2020')).toBeNull();
  });
  it('registry ISO with time', () => {
    expect(extractPastDate('2020-01-15T10:00:00')).toBeInstanceOf(Date);
  });
});
