import { describe, expect, test } from 'bun:test';
import {
  ledgerWindowsFor,
  orderLedgerWindows,
  poolProvider,
} from '@/features/quota/ledgerModel';
import { XAI_WEEKLY_ROW_ID } from '@/features/quota/resetSchedule';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('quota ledger model', () => {
  test('claude windows convert percent used into remaining', () => {
    const windows = ledgerWindowsFor('claude', {
      status: 'success',
      windows: [
        { id: 'five-hour', label: '5-hour limit', usedPercent: 40, resetAtMs: NOW + 5000, periodHours: 5 },
        { id: 'seven-day', label: '7-day limit', usedPercent: 12, resetAtMs: NOW + DAY, periodHours: 168 },
      ],
    });
    expect(windows.map((w) => [w.key, w.remaining])).toEqual([
      ['five-hour', 60],
      ['seven-day', 88],
    ]);
  });

  test('codex clamps used percent out of range', () => {
    const windows = ledgerWindowsFor('codex', {
      status: 'success',
      windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 140 }],
    });
    expect(windows[0].remaining).toBe(0);
  });

  test('antigravity buckets flatten groups and scale remaining fraction', () => {
    const windows = ledgerWindowsFor('antigravity', {
      status: 'success',
      groups: [
        { buckets: [{ id: 'a', label: 'A', remainingFraction: 0.754 }] },
        { buckets: [{ id: 'b', label: 'B', remainingFraction: 0.2 }] },
      ],
    });
    expect(windows.map((w) => w.remaining)).toEqual([75, 20]);
  });

  test('kimi derives remaining from used/limit and nulls non-positive limits', () => {
    const windows = ledgerWindowsFor('kimi', {
      status: 'success',
      rows: [
        { id: 'r1', label: 'R1', used: 25, limit: 100 },
        { id: 'r2', label: 'R2', used: 5, limit: 0 },
      ],
    });
    expect(windows.map((w) => w.remaining)).toEqual([75, null]);
  });

  test('non-success states produce no windows', () => {
    expect(ledgerWindowsFor('claude', { status: 'loading' })).toEqual([]);
    expect(ledgerWindowsFor('codex', { status: 'error' })).toEqual([]);
    expect(ledgerWindowsFor('kimi', undefined)).toEqual([]);
  });

  test('xai weekly uses the shared row id and adds product usage', () => {
    const windows = ledgerWindowsFor('xai', {
      status: 'success',
      billing: {
        periodType: 'weekly',
        usagePercent: 30,
        resetAtMs: NOW + DAY,
        productUsage: [{ product: 'grok', usagePercent: 10 }],
      },
    });
    expect(windows[0].key).toBe(XAI_WEEKLY_ROW_ID);
    expect(windows[0].labelKey).toBe('xai_quota.weekly_limit');
    expect(windows[1].key).toBe('xai:product:grok');
  });

  test('pooling counts capacity only over reporting credentials', () => {
    const quotaA = {
      status: 'success',
      windows: [{ id: 'weekly', label: 'W', usedPercent: 20, resetAtMs: NOW + DAY }],
    };
    const quotaB = {
      status: 'success',
      windows: [{ id: 'weekly', label: 'W', usedPercent: 60, resetAtMs: NOW + DAY }],
    };
    const quotaC = { status: 'error', error: 'boom' };
    const pool = poolProvider('claude', [quotaA, quotaB, quotaC], NOW);
    const weekly = pool.headline;
    expect(weekly?.key).toBe('weekly');
    expect(weekly?.remainingSum).toBe(80 + 40);
    expect(weekly?.capacity).toBe(200);
    expect(weekly?.reporting).toBe(2);
    expect(weekly?.segments).toEqual([80, 40, null]);
    expect(pool.credentialCount).toBe(3);
    expect(pool.loadedCount).toBe(2);
  });

  test('headline prefers the weekly window over a lower 5-hour one', () => {
    const quota = {
      status: 'success',
      windows: [
        { id: 'five-hour', label: '5h', usedPercent: 90, periodHours: 5, resetAtMs: NOW + 1000 },
        { id: 'seven-day', label: '7d', usedPercent: 30, periodHours: 168, resetAtMs: NOW + DAY },
      ],
    };
    const pool = poolProvider('claude', [quota], NOW);
    expect(pool.headline?.key).toBe('seven-day');
    expect(pool.others.map((w) => w.key)).toEqual(['five-hour']);
  });

  test('headline falls back to the lowest-fill window when none is long', () => {
    const quota = {
      status: 'success',
      windows: [
        { id: 'a', label: 'A', usedPercent: 10, periodHours: 5, resetAtMs: NOW + 1000 },
        { id: 'b', label: 'B', usedPercent: 80, periodHours: 4, resetAtMs: NOW + 1000 },
      ],
    };
    const pool = poolProvider('claude', [quota], NOW);
    expect(pool.headline?.key).toBe('b');
  });

  test('soonest pooled reset ignores instants at or before now', () => {
    const quota = {
      status: 'success',
      windows: [
        { id: 'weekly', label: 'W', usedPercent: 10, resetAtMs: NOW - 1000 },
        { id: 'daily', label: 'D', usedPercent: 20, resetAtMs: NOW + DAY },
      ],
    };
    const pool = poolProvider('claude', [quota], NOW);
    const weekly = pool.others.find((w) => w.key === 'weekly') ?? pool.headline;
    expect(weekly?.soonestResetAtMs).toBeNull();
    expect(pool.headline?.soonestResetAtMs).toBe(NOW + DAY);
  });

  test('orderLedgerWindows lifts the headline key first', () => {
    const windows = ledgerWindowsFor('claude', {
      status: 'success',
      windows: [
        { id: 'five-hour', label: '5h', usedPercent: 1 },
        { id: 'seven-day', label: '7d', usedPercent: 2 },
        { id: 'opus', label: 'Opus', usedPercent: 3 },
      ],
    });
    expect(orderLedgerWindows(windows, 'seven-day').map((w) => w.key)).toEqual([
      'seven-day',
      'five-hour',
      'opus',
    ]);
    expect(orderLedgerWindows(windows, 'missing').map((w) => w.key)).toEqual([
      'five-hour',
      'seven-day',
      'opus',
    ]);
  });
});
