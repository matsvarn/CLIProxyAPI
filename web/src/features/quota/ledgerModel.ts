/**
 * Quota ledger model: per-credential windows and per-provider pools.
 *
 * Pure functions — no React, no clock of its own (`nowMs` is always passed
 * in), so every case here is directly testable.
 *
 * Two questions the card grid answers poorly drive this model:
 * - per credential: *what are this account's limits, and when do they recover?*
 *   (`ledgerWindowsFor` + `orderLedgerWindows`)
 * - per provider: *how much capacity does the whole pool have left?*
 *   (`poolProvider`)
 *
 * The window shapes deliberately mirror `buildTimelineLane` in
 * quotaTimelineModel.ts — the same provider-specific reads and the same
 * used-vs-remaining conversions — so both views agree on what a credential is
 * reporting. They must not be merged: the timeline picks ONE window per
 * credential against a visible span; the ledger enumerates ALL of them and
 * pools them across credentials.
 */

import type { QuotaProviderType } from './providers/types';
import { XAI_WEEKLY_ROW_ID } from './resetSchedule';

/** One limit window of one credential. */
export interface LedgerWindow {
  /**
   * Pooling identity: `window.id` when the provider assigns one, else the
   * label key, else the label itself. Windows from different credentials with
   * the same key are the same limit (e.g. every Codex account's `weekly`).
   */
  key: string;
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  /** Remaining percent, 0..100 — converted from whatever the provider reports. */
  remaining: number | null;
  resetAtMs: number | null;
  /** Window length in hours, when the provider reports or implies one. */
  periodHours: number | null;
}

/** One window pooled across all of a provider's credentials. */
export interface PooledWindow {
  key: string;
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  /** Sum of `remaining` over credentials that report this window. */
  remainingSum: number;
  /** `100 * reporting` — the denominator `remainingSum` reads against. */
  capacity: number;
  /** Credentials contributing a non-null remaining to this window. */
  reporting: number;
  /**
   * One entry per input quota, in input order: that credential's remaining in
   * this window, or null when it doesn't report it (not loaded, error, or the
   * account simply lacks the window). Renders as the empty track segment.
   */
  segments: (number | null)[];
  /** Earliest reported reset strictly after `nowMs`, null when none is pending. */
  soonestResetAtMs: number | null;
  periodHours: number | null;
}

/** A provider's pooled headline window plus the rest of its pool. */
export interface ProviderPool {
  provider: QuotaProviderType;
  credentialCount: number;
  loadedCount: number;
  headline: PooledWindow | null;
  others: PooledWindow[];
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/* Structural shapes — same reads as quotaTimelineModel.ts. */

interface WindowLike {
  id?: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  usedPercent?: number | null;
  remainingPercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

interface KimiRowLike {
  id?: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  used: number;
  limit: number;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

interface XaiBillingLike {
  periodType?: string;
  usagePercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
  productUsage?: { product?: string; usagePercent?: number | null }[];
}

interface AntigravityBucketLike {
  id?: string;
  label?: string;
  /** Fraction 0..1 of quota REMAINING — the inverse of the percent-used providers. */
  remainingFraction?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

interface MetaWindowLike {
  id: 'window' | 'weekly';
  usedPercent: number | null;
  /** Unix seconds from the upstream Meta contract. */
  resetAt?: number;
  durationMinutes?: number;
}

const windowKey = (window: { id?: string; labelKey?: string; label?: string }, fallback: string) =>
  window.id || window.labelKey || window.label || fallback;

const toLedgerWindow = (
  key: string,
  source: {
    label?: string;
    labelKey?: string;
    labelParams?: Record<string, string | number>;
    resetAtMs?: number | null;
    periodHours?: number | null;
  },
  remaining: number | null
): LedgerWindow => ({
  key,
  label: source.label ?? '',
  labelKey: source.labelKey,
  labelParams: source.labelParams,
  remaining,
  resetAtMs:
    typeof source.resetAtMs === 'number' && Number.isFinite(source.resetAtMs)
      ? source.resetAtMs
      : null,
  periodHours:
    typeof source.periodHours === 'number' && Number.isFinite(source.periodHours)
      ? source.periodHours
      : null,
});

/**
 * All limit windows of one credential, or [] unless the quota state is
 * `success`. Ordering follows the provider's own window order; reordering for
 * display is `orderLedgerWindows`' job.
 */
export function ledgerWindowsFor(provider: QuotaProviderType, quota: unknown): LedgerWindow[] {
  const state = quota as { status?: string } | undefined;
  if (!state || state.status !== 'success') return [];

  if (provider === 'claude' || provider === 'codex') {
    // Both store percent USED.
    return ((quota as { windows?: WindowLike[] }).windows ?? []).map((window, index) =>
      toLedgerWindow(
        windowKey(window, `window-${index}`),
        window,
        typeof window.usedPercent === 'number' ? clampPercent(100 - window.usedPercent) : null
      )
    );
  }

  if (provider === 'devin') {
    return ((quota as { windows?: WindowLike[] }).windows ?? []).map((window, index) =>
      toLedgerWindow(
        windowKey(window, `window-${index}`),
        window,
        typeof window.remainingPercent === 'number'
          ? clampPercent(window.remainingPercent)
          : null
      )
    );
  }

  if (provider === 'xai') {
    const billing = (quota as { billing?: XaiBillingLike | null }).billing;
    if (!billing) return [];
    const windows: LedgerWindow[] = [];
    if (billing.periodType === 'weekly') {
      windows.push(
        toLedgerWindow(
          XAI_WEEKLY_ROW_ID,
          { labelKey: 'xai_quota.weekly_limit', ...billing },
          typeof billing.usagePercent === 'number' ? clampPercent(100 - billing.usagePercent) : null
        )
      );
    }
    (billing.productUsage ?? []).forEach((entry, index) => {
      windows.push(
        toLedgerWindow(
          `xai:product:${entry.product ?? index}`,
          { label: entry.product ?? '' },
          typeof entry.usagePercent === 'number'
            ? clampPercent(100 - entry.usagePercent)
            : null
        )
      );
    });
    return windows;
  }

  if (provider === 'antigravity') {
    // Buckets live one level down inside display groups — flatten them, and
    // note the fraction is REMAINING, not percent used.
    return ((quota as { groups?: { buckets?: AntigravityBucketLike[] }[] }).groups ?? [])
      .flatMap((group) => group.buckets ?? [])
      .map((bucket, index) =>
        toLedgerWindow(
          windowKey(bucket, `bucket-${index}`),
          bucket,
          typeof bucket.remainingFraction === 'number'
            ? clampPercent(Math.round(bucket.remainingFraction * 100))
            : null
        )
      );
  }

  if (provider === 'kimi') {
    // Kimi reports raw counts; remaining is derived and unknown when the limit
    // is not positive.
    return ((quota as { rows?: KimiRowLike[] }).rows ?? []).map((row, index) =>
      toLedgerWindow(
        windowKey(row, `row-${index}`),
        row,
        row.limit > 0 ? clampPercent(Math.round(((row.limit - row.used) / row.limit) * 100)) : null
      )
    );
  }

  if (provider === 'meta') {
    const source = (quota as { data?: { windows?: MetaWindowLike[] } }).data?.windows ?? [];
    return source.map((window) => {
      const durationMinutes =
        window.id === 'weekly' ? 7 * 24 * 60 : window.durationMinutes;
      return {
        key: window.id,
        label: `meta_quota.${window.id}`,
        labelKey: `meta_quota.${window.id}`,
        labelParams: undefined,
        remaining:
          typeof window.usedPercent === 'number' && Number.isFinite(window.usedPercent)
            ? clampPercent(100 - window.usedPercent)
            : null,
        resetAtMs:
          typeof window.resetAt === 'number' && Number.isFinite(window.resetAt)
            ? window.resetAt * 1000
            : null,
        periodHours:
          typeof durationMinutes === 'number' &&
          Number.isFinite(durationMinutes) &&
          durationMinutes > 0
            ? durationMinutes / 60
            : null,
      };
    });
  }

  return [];
}

/**
 * Pool one window kind across all of a provider's credentials.
 *
 * `quotas` holds one entry per credential in display order; a credential that
 * reports nothing (idle, loading, error, or success without the window)
 * contributes a null segment and is excluded from `reporting`/`capacity`.
 */
export function poolProvider(
  provider: QuotaProviderType,
  quotas: readonly unknown[],
  nowMs: number
): ProviderPool {
  const perCredential = quotas.map((quota) => ledgerWindowsFor(provider, quota));
  const loadedCount = quotas.filter(
    (quota) => (quota as { status?: string } | undefined)?.status === 'success'
  ).length;

  const pools = new Map<string, PooledWindow>();
  perCredential.forEach((windows, credentialIndex) => {
    windows.forEach((window) => {
      let pool = pools.get(window.key);
      if (!pool) {
        pool = {
          key: window.key,
          label: window.label,
          labelKey: window.labelKey,
          labelParams: window.labelParams,
          remainingSum: 0,
          capacity: 0,
          reporting: 0,
          segments: quotas.map(() => null),
          soonestResetAtMs: null,
          periodHours: window.periodHours,
        };
        pools.set(window.key, pool);
      }
      if (window.remaining !== null) {
        pool.remainingSum += window.remaining;
        pool.reporting += 1;
        pool.segments[credentialIndex] = window.remaining;
      }
      if (window.resetAtMs !== null && window.resetAtMs > nowMs) {
        if (pool.soonestResetAtMs === null || window.resetAtMs < pool.soonestResetAtMs) {
          pool.soonestResetAtMs = window.resetAtMs;
        }
      }
    });
  });

  const pooled = Array.from(pools.values()).map((pool) => ({
    ...pool,
    capacity: pool.reporting * 100,
  }));
  const reporting = pooled.filter((pool) => pool.reporting > 0);

  /**
   * Headline rule: the window that most constrains the pool. Long windows
   * (>= 24h, or unknown length) are preferred — a 5-hour window refills by
   * itself, a depleted weekly does not — then lowest pooled fill, then longer
   * period, then key for determinism. With nothing long reporting, the
   * lowest-fill window overall leads instead of showing nothing.
   */
  const byFill = (a: PooledWindow, b: PooledWindow) =>
    a.remainingSum / a.capacity - b.remainingSum / b.capacity ||
    (b.periodHours ?? 0) - (a.periodHours ?? 0) ||
    a.key.localeCompare(b.key);
  const longWindows = reporting.filter(
    (pool) => pool.periodHours === null || pool.periodHours >= 24
  );
  const headline = (longWindows.length > 0 ? longWindows : reporting)
    .reduce<PooledWindow | null>(
      (best, pool) => (best === null || byFill(pool, best) < 0 ? pool : best),
      null
    );

  return {
    provider,
    credentialCount: quotas.length,
    loadedCount,
    headline,
    others: pooled.filter((pool) => pool !== headline),
  };
}

/**
 * Display order for one credential's windows: the provider-pool headline key
 * first, then the provider's own order. When there is no headline (or the
 * credential doesn't report it), the order passes through unchanged.
 */
export function orderLedgerWindows(
  windows: LedgerWindow[],
  headlineKey: string | null
): LedgerWindow[] {
  if (headlineKey === null) return [...windows];
  const headlineIndex = windows.findIndex((window) => window.key === headlineKey);
  if (headlineIndex === -1) return [...windows];
  return [windows[headlineIndex], ...windows.filter((_, index) => index !== headlineIndex)];
}
