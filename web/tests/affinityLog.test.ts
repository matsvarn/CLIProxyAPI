import { describe, expect, test } from 'bun:test';
import {
  parseAffinityLine,
  parseDurationMs,
  summarizeAffinity,
  type AffinityEvent,
} from '@/features/routing/affinityLog';

const AUTH = 'codex-2a524877-m.varnskuehler@gmail.com-pro.json';

const line = (phrase: string, fields: string) =>
  `[2026-07-30 07:48:16] [e87ca9ee] [info ] [selector.go:436] session-affinity: ${phrase} | ${fields}`;

const FIELDS = `session=msg:77445d9898e76b1b auth=${AUTH} provider=mixed model=gpt-5.6-sol`;

describe('parseAffinityLine', () => {
  test('parses a plain cache hit', () => {
    const event = parseAffinityLine(line('cache hit', FIELDS));
    expect(event?.kind).toBe('hit');
    expect(event?.phrase).toBe('cache hit');
    expect(event?.session).toBe('msg:77445d9898e76b1b');
    expect(event?.auth).toBe(AUTH);
    expect(event?.provider).toBe('mixed');
    expect(event?.model).toBe('gpt-5.6-sol');
    expect(event?.requestId).toBe('e87ca9ee');
    expect(Number.isFinite(event?.atMs)).toBe(true);
  });

  test.each([
    'fallback cache hit',
    'fork cache hit',
    'LCP cache hit',
    'LCP fork hit',
    'LCP compaction hit',
  ])('classifies "%s" as a hit', (phrase) => {
    expect(parseAffinityLine(line(phrase, FIELDS))?.kind).toBe('hit');
  });

  test.each([
    'cache miss, new binding',
    'LCP cache miss, new binding',
    'fork bound to new auth',
    'LCP fork bound to new auth',
    'LCP compaction bound to new auth',
  ])('classifies "%s" as a bind', (phrase) => {
    expect(parseAffinityLine(line(phrase, FIELDS))?.kind).toBe('bind');
  });

  test('the rebind phrase is not misread as a hit', () => {
    const event = parseAffinityLine(
      line('cache hit but auth unavailable, reselected', FIELDS)
    );
    expect(event?.kind).toBe('rebind');
    expect(event?.phrase).toBe('cache hit but auth unavailable, reselected');
  });

  test('LCP lines carry prefix and parent fields', () => {
    const lcp = parseAffinityLine(
      line('LCP cache hit', `session=s1 prefix=42 auth=${AUTH} provider=codex model=g`)
    );
    expect(lcp?.kind).toBe('hit');

    const fork = parseAffinityLine(
      line('fork bound to new auth', `session=s2 parent=p9 auth=${AUTH} provider=codex model=g`)
    );
    expect(fork?.kind).toBe('bind');
    expect(fork?.parent).toBe('p9');

    const fallback = parseAffinityLine(
      line('fallback cache hit', `session=s3 fallback=p7 auth=${AUTH} provider=codex model=g`)
    );
    expect(fallback?.parent).toBe('p7');
  });

  test('unrelated and malformed lines return null', () => {
    expect(parseAffinityLine('')).toBeNull();
    expect(parseAffinityLine('some random log line')).toBeNull();
    expect(
      parseAffinityLine(
        '[2026-07-30 07:48:16] [e87ca9ee] [info ] [selector.go:1] session-affinity: unknown phrase | session=s auth=a'
      )
    ).toBeNull();
    expect(
      parseAffinityLine(
        '[2026-07-30 07:48:16] [e87ca9ee] [info ] [selector.go:1] other: cache hit | session=s auth=a'
      )
    ).toBeNull();
  });
});

describe('summarizeAffinity', () => {
  const event = (over: Partial<AffinityEvent>): AffinityEvent => ({
    atMs: 1000,
    requestId: 'r',
    kind: 'hit',
    phrase: 'cache hit',
    session: 's1',
    auth: AUTH,
    provider: 'mixed',
    model: 'm',
    ...over,
  });

  test('counts kinds and computes the hit rate', () => {
    const summary = summarizeAffinity(
      [
        event({ kind: 'hit' }),
        event({ kind: 'hit' }),
        event({ kind: 'bind' }),
        event({ kind: 'rebind', phrase: 'cache hit but auth unavailable, reselected' }),
      ],
      10_000,
      60_000
    );
    expect(summary.hits).toBe(2);
    expect(summary.binds).toBe(1);
    expect(summary.rebinds).toBe(1);
    expect(summary.hitRate).toBeCloseTo(0.5);
    expect(summary.accounts).toHaveLength(1);
    expect(summary.accounts[0].hits).toBe(2);
  });

  test('hitRate is null with no events', () => {
    expect(summarizeAffinity([], 0, 60_000).hitRate).toBeNull();
  });

  test('activeSessions honors the ttl cutoff', () => {
    const now = 100_000;
    const summary = summarizeAffinity(
      [
        event({ session: 'fresh', atMs: now - 1000 }),
        event({ session: 'stale', atMs: now - 120_000 }),
      ],
      now,
      60_000
    );
    expect(summary.accounts[0].activeSessions).toBe(1);
    expect(summary.sessions).toHaveLength(2);
    expect(summary.sessions[0].session).toBe('fresh');
  });
});

describe('parseDurationMs', () => {
  test('parses Go duration strings', () => {
    expect(parseDurationMs('1h')).toBe(3_600_000);
    expect(parseDurationMs('30m')).toBe(1_800_000);
    expect(parseDurationMs('90s')).toBe(90_000);
    expect(parseDurationMs('1h30m')).toBe(5_400_000);
    expect(parseDurationMs('bogus')).toBeNull();
    expect(parseDurationMs('')).toBeNull();
    expect(parseDurationMs(undefined)).toBeNull();
  });
});
