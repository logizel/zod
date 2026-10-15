// BucketRegistry tests — cooldown, daily-cap, canFire, self-recovery, tiers.
// No network, no PocketBase — pure state machine.

import { describe, expect, it } from 'vitest';
import { BucketRegistry, BucketState, type BucketDef } from './bucket.js';

const GROQ: BucketDef = { provider: 'groq', model: 'llama-3.1-8b-instant', tier: 'tier1' };
const GITHUB: BucketDef = { provider: 'github', model: 'gpt-4.1-mini', tier: 'tier1' };
const MISTRAL: BucketDef = { provider: 'mistral', model: 'mistral-small-latest', tier: 'tier2' };

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
    expect(reg.getStates()[0].cooldownUntil).toBe(0);
  });

  it('marks daily-cap and skips bucket', () => {
    const reg = new BucketRegistry([GROQ]);
    reg.markDailyCap('groq', 'llama-3.1-8b-instant');
    expect(reg.canFire('groq', 'llama-3.1-8b-instant')).toBe(false);
    expect(reg.isDailyCapped('groq', 'llama-3.1-8b-instant')).toBe(true);
    expect(reg.dailyCapExhausted('groq', 'llama-3.1-8b-instant')).toBe(true);
    expect(reg.getStates()[0].state).toBe(BucketState.DAILY_CAP);
  });

  it('dailyCapExhausted true when remaining hits 0', () => {
    const reg = new BucketRegistry([GROQ]);
    reg.consumeDailyCap('groq', 'llama-3.1-8b-instant'); // only consumes 1, not exhausted
    expect(reg.dailyCapExhausted('groq', 'llama-3.1-8b-instant')).toBe(false);
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

  it('getLadder returns buckets in registration order with tier', () => {
    const reg = new BucketRegistry([GROQ, GITHUB, MISTRAL]);
    expect(reg.getLadder()).toEqual([GROQ, GITHUB, MISTRAL]);
  });

  it('getTier1 / getTier2 split by tier', () => {
    const reg = new BucketRegistry([GROQ, GITHUB, MISTRAL]);
    expect(reg.getTier1()).toEqual([GROQ, GITHUB]);
    expect(reg.getTier2()).toEqual([MISTRAL]);
  });

  it('allTier1Available true when any Tier1 bucket can fire', () => {
    const reg = new BucketRegistry([GROQ, MISTRAL]);
    expect(reg.allTier1Available()).toBe(true);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 60);
    // no Tier1 ready → false (Tier2 gate would engage)
    expect(reg.allTier1Available()).toBe(false);
  });

  it('allTier1Available false when all Tier1 buckets COOLDOWN/DAILY-CAP', () => {
    const reg = new BucketRegistry([GROQ, GITHUB]);
    reg.markCooldown('groq', 'llama-3.1-8b-instant', 60);
    reg.markDailyCap('github', 'gpt-4.1-mini');
    expect(reg.allTier1Available()).toBe(false);
  });

  it('Cerebras is absent from the default ladder', () => {
    const providers = new BucketRegistry([GROQ, GITHUB]).getLadder().map((b) => b.provider);
    expect(providers).not.toContain('cerebras');
  });
});
