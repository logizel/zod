import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  loadTasteRules,
  checkBlockRules,
  buildTastePromptInjection,
  applyTastePreScoring,
  checkHardComplianceGates,
} from './taste-apply.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makePb(overrides: {
  tasteRulesItems?: unknown[];
  tombstoneCreated?: unknown[];
  getListOverride?: any;
}): {
  pb: any;
  collections: { taste_rules: any; tombstone_ledger: any };
} {
  const tasteRulesItems = overrides.tasteRulesItems ?? [];
  const tombstoneCreated = overrides.tombstoneCreated ?? [];

  const tasteRules = {
    getList: overrides.getListOverride
      ? vi.fn(overrides.getListOverride)
      : vi.fn().mockResolvedValue({ items: tasteRulesItems, totalItems: tasteRulesItems.length }),
  };
  const tombstoneLedger = {
    create: vi.fn().mockImplementation(async (data: any) => {
      tombstoneCreated.push(data);
      return { id: `ts-${tombstoneCreated.length}` };
    }),
  };

  const pb: any = {
    collection: vi.fn((name: string) => {
      if (name === 'taste_rules') return tasteRules;
      if (name === 'tombstone_ledger') return tombstoneLedger;
      throw new Error(`unknown collection: ${name}`);
    }),
  };

  return { pb, collections: { taste_rules: tasteRules, tombstone_ledger: tombstoneLedger } };
}

// ---------------------------------------------------------------------------
// loadTasteRules
// ---------------------------------------------------------------------------

describe('loadTasteRules', () => {
  it('fetches all taste_rules sorted by created desc', async () => {
    const { pb } = makePb({
      tasteRulesItems: [
        { id: 'tr-1', kind: 'BLOCK', rule: 'scam', weight: 1.0, source: 'reaction', created_at: '2026-10-01T00:00:00Z' },
        { id: 'tr-2', kind: 'BOOST', rule: 'AI events', weight: 2.0, source: 'keyword', created_at: '2026-10-02T00:00:00Z' },
      ],
    });

    const rules = await loadTasteRules(pb as any);

    expect(pb.collection('taste_rules').getList).toHaveBeenCalledWith(1, 200, { sort: '-created' });
    expect(rules).toHaveLength(2);
    expect(rules[0].kind).toBe('BLOCK');
    expect(rules[1].kind).toBe('BOOST');
  });

  it('returns empty array when no rules exist', async () => {
    const { pb } = makePb({ tasteRulesItems: [] });
    const rules = await loadTasteRules(pb as any);
    expect(rules).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkBlockRules
// ---------------------------------------------------------------------------

describe('checkBlockRules', () => {
  const blockRule: any = { kind: 'BLOCK', rule: 'crypto', weight: 1.0, source: 'reaction' };
  const boostRule: any = { kind: 'BOOST', rule: 'AI', weight: 1.0, source: 'keyword' };

  it('blocks candidate whose title contains rule text (case-insensitive)', () => {
    const { blocked, passed } = checkBlockRules(
      [{ url: 'u1', title: 'Crypto Workshop 2026', snippet: 'learn blockchain' }],
      [blockRule],
    );
    expect(blocked).toHaveLength(1);
    expect(blocked[0].title).toBe('Crypto Workshop 2026');
    expect(passed).toHaveLength(0);
  });

  it('blocks candidate whose snippet contains rule text (case-insensitive)', () => {
    const { blocked, passed } = checkBlockRules(
      [{ url: 'u1', title: 'Tech Event', snippet: 'CRYPTO and NFTs galore' }],
      [blockRule],
    );
    expect(blocked).toHaveLength(1);
    expect(passed).toHaveLength(0);
  });

  it('passes candidate that matches no block rule', () => {
    const { blocked, passed } = checkBlockRules(
      [{ url: 'u1', title: 'AI Hackathon', snippet: 'build things' }],
      [blockRule],
    );
    expect(blocked).toHaveLength(0);
    expect(passed).toHaveLength(1);
  });

  it('ignores non-BLOCK rules (BOOST is advisory)', () => {
    const { blocked, passed } = checkBlockRules(
      [{ url: 'u1', title: 'CRYPTO event', snippet: 'blockchain' }],
      [boostRule],
    );
    expect(blocked).toHaveLength(0);
    expect(passed).toHaveLength(1);
  });

  it('blocks on any matching block rule', () => {
    const rules = [blockRule, { kind: 'BLOCK', rule: 'scam', weight: 1.0, source: 'dm' }];
    const { blocked, passed } = checkBlockRules(
      [{ url: 'u1', title: 'Legit Event', snippet: 'this is a scam alert' }],
      rules,
    );
    expect(blocked).toHaveLength(1);
    expect(passed).toHaveLength(0);
  });

  it('returns empty when no candidates', () => {
    const { blocked, passed } = checkBlockRules([], [blockRule]);
    expect(blocked).toEqual([]);
    expect(passed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTastePromptInjection
// ---------------------------------------------------------------------------

describe('buildTastePromptInjection', () => {
  it('returns empty string when no rules', () => {
    expect(buildTastePromptInjection([])).toBe('');
    expect(buildTastePromptInjection([{ kind: 'BLOCK', rule: 'x', weight: 1, source: 'r' }])).toBe('');
  });

  it('formats BOOST/WEIGHT/CUSTOM as advisory injection', () => {
    const rules = [
      { kind: 'BOOST', rule: 'AI hackathons', weight: 2.0, source: 'keyword' },
      { kind: 'WEIGHT', rule: 'student events', weight: 1.5, source: 'dm' },
      { kind: 'CUSTOM', rule: 'prefer weekend events', weight: 1.0, source: 'reaction' },
    ];
    const result = buildTastePromptInjection(rules);

    expect(result).toContain('Operator taste rules (advisory, not authoritative)');
    expect(result).toContain('- BOOST: AI hackathons (weight: 2)');
    expect(result).toContain('- WEIGHT: student events (weight: 1.5)');
    expect(result).toContain('- CUSTOM: prefer weekend events (weight: 1)');
  });

  it('excludes BLOCK rules from injection', () => {
    const rules = [
      { kind: 'BLOCK', rule: 'crypto', weight: 1.0, source: 'reaction' },
      { kind: 'BOOST', rule: 'AI', weight: 1.0, source: 'keyword' },
    ];
    const result = buildTastePromptInjection(rules);
    expect(result).not.toContain('BLOCK');
    expect(result).toContain('BOOST: AI');
  });
});

// ---------------------------------------------------------------------------
// applyTastePreScoring
// ---------------------------------------------------------------------------

describe('applyTastePreScoring', () => {
  it('tombstones blocked candidates and returns passed only', async () => {
    const { pb, collections } = makePb({
      tasteRulesItems: [{ kind: 'BLOCK', rule: 'crypto', weight: 1.0, source: 'reaction' }],
    });

    const rules = [{ kind: 'BLOCK', rule: 'crypto', weight: 1.0, source: 'reaction' }];
    const result = await applyTastePreScoring(
      [{ url: 'https://example.com/crypto', title: 'Crypto Event', snippet: 'blockchain' }],
      rules,
      pb as any,
      'https://example.com/crypto',
    );

    expect(result).toHaveLength(0);
    expect(collections.tombstone_ledger.create).toHaveBeenCalledTimes(1);
    const tsCall = collections.tombstone_ledger.create.mock.calls[0][0];
    expect(tsCall.terminal_status).toBe('taste_blocked');
    expect(tsCall.source).toBe('taste_rule');
    expect(tsCall.url_hash).toBeTruthy();
    expect(tsCall.fingerprint).toBe(tsCall.url_hash);
  });

  it('returns all candidates when none match block rules', async () => {
    const { pb } = makePb({
      tasteRulesItems: [{ kind: 'BLOCK', rule: 'crypto', weight: 1.0, source: 'reaction' }],
    });

    const rules = [{ kind: 'BLOCK', rule: 'crypto', weight: 1.0, source: 'reaction' }];
    const result = await applyTastePreScoring(
      [{ url: 'https://example.com/ai', title: 'AI Event', snippet: 'machine learning' }],
      rules,
      pb as any,
      'https://example.com/ai',
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('AI Event');
  });
});

// ---------------------------------------------------------------------------
// checkHardComplianceGates
// ---------------------------------------------------------------------------

describe('checkHardComplianceGates', () => {
  it('blocks pay-to-training (training fee)', () => {
    const result = checkHardComplianceGates('Certification Course', 'Pay the training fee to enroll');
    expect(result).toEqual({ blocked: true, reason: 'pay_to_training' });
  });

  it('blocks pay-to-join', () => {
    const result = checkHardComplianceGates('Event', 'pay to join our exclusive group');
    expect(result).toEqual({ blocked: true, reason: 'pay_to_training' });
  });

  it('blocks US-only swag', () => {
    const result = checkHardComplianceGates('Swag Box', 'US only shipping');
    expect(result).toEqual({ blocked: true, reason: 'us_eu_only_swag' });
  });

  it('blocks EMEA-only', () => {
    const result = checkHardComplianceGates('Perk', 'emea-only offer');
    expect(result).toEqual({ blocked: true, reason: 'us_eu_only_swag' });
  });

  it('blocks 2+ years experience role', () => {
    const result = checkHardComplianceGates('Senior Engineer', '5+ years experience required');
    expect(result).toEqual({ blocked: true, reason: 'experience_min_2plus' });
  });

  it('blocks lead role with years', () => {
    const result = checkHardComplianceGates('Lead Developer', '3+ yrs experience');
    expect(result).toEqual({ blocked: true, reason: 'experience_min_2plus' });
  });

  it('returns null when no hard gate matches', () => {
    const result = checkHardComplianceGates('Hackathon', '24-hour coding event with prize');
    expect(result).toBeNull();
  });

  it('returns null for fresher-friendly role (0-1 years)', () => {
    const result = checkHardComplianceGates('Frontend Intern', '0-1 years experience, India based');
    expect(result).toBeNull();
  });
});
