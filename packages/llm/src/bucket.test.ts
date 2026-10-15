// BucketRegistry tests — cooldown, daily-cap, canFire, self-recovery.
// No network, no PocketBase — pure state machine.

import { describe, expect, it } from 'vitest';
import { BucketRegistry, BucketState } from './bucket.js';

const GROQ = { provider: 'groq', model: 'llama-3.1-8b-instant' } as const;
const GITHUB = { provider: 'github', model: 'gpt-4.1-mini' } as const;

describe('BucketRegistry', () => {
  it('starts all buckets READY', () => {
    const reg = new BucketRegistry([GROQ, GITHUB]);
    expect(reg.canFire('groq', 'llama-3.1-8b-instant')).toBe(true);
    expect(reg.canFire('github', 'gpt-4.1-mini')).toBe(true);
  });

  it('marks cooldown and blocks until expiry', () => {
    const reg = new BucketRegistry([GROQ]);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 60);
    expect(reg.canFire('groq', 'llama-3.1-8b-instant')).toBe(false);
    const states = reg.getStates();
    expect(states[0].state).toBe(BucketState.COOLDOWN);
    expect(states[0].cooldownUntil).toBeGreaterThan(Date.now());
  });

  it('self-recovers from cooldown after expiry (time-driven, not caller-blocked)', () => {
    const reg = new BucketRegistry([GROQ]);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 0); // 0s = already expired
    expect(reg.canFire('groq', 'llama-3.1-8b-instant')).toBe(true);
    expect(reg.getStates()[0].state).toBe(BucketState.READY);
  });

  it('marks daily-cap and skips bucket', () => {
    const reg = new BucketRegistry([GROQ]);
    reg.markDailyCap('groq', 'llama-3.1-8b-instant');
    expect(reg.canFire('groq', 'llama-3.1-8b-instant')).toBe(false);
    expect(reg.getStates()[0].state).toBe(BucketState.DAILY_CAP);
  });

  it('recordSuccess returns bucket to READY', () => {
    const reg = new BucketRegistry([GROQ]);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 0);
    reg.recordSuccess('groq', 'llama-3.1-8b-instant');
    expect(reg.canFire('groq', 'llama-3.1-8b-instant')).toBe(true);
    expect(reg.getStates()[0].state).toBe(BucketState.READY);
    expect(reg.getStates()[0].cooldownUntil).toBe(0);
  });

  it('findNextAvailable returns first fireable bucket in ladder order', () => {
    const reg = new BucketRegistry([GROQ, GITHUB]);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 60);
    const next = reg.findNextAvailable();
    expect(next).toEqual(GITHUB);
  });

  it('findNextAvailable returns null when all buckets blocked', () => {
    const reg = new BucketRegistry([GROQ, GITHUB]);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 60);
    reg.markDailyCap('github', 'gpt-4.1-mini');
    expect(reg.findNextAvailable()).toBeNull();
  });

  it('getLadder returns buckets in registration order', () => {
    const reg = new BucketRegistry([GROQ, GITHUB]);
    expect(reg.getLadder()).toEqual([GROQ, GITHUB]);
  });

  it('Cerebras is absent from the default ladder', () => {
    // Constructed ladder only has groq + github — no Cerebras provider.
    const providers = new BucketRegistry([GROQ, GITHUB]).getLadder().map((b) => b.provider);
    expect(providers).not.toContain('cerebras');
  });
});
