/**
 * Shared human-readable plan labels: translates known backend plan ids through
 * the quota i18n keys the card bodies already use, and humanizes unknown ids
 * ("plan_max" -> "Max") so raw identifiers never leak into the UI.
 */
import type { TFunction } from 'i18next';
import { normalizePlanType, PREMIUM_CODEX_PLAN_TYPES } from '@/utils/quota';
import type { QuotaProviderType } from './providers/types';

const humanize = (raw: string): string =>
  raw
    .replace(/^plan[_-]/i, '')
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export const quotaPlanLabel = (
  t: TFunction,
  type: QuotaProviderType | string,
  rawPlan: string | null | undefined
): string | null => {
  if (!rawPlan) return null;
  if (type === 'codex') {
    const normalized = normalizePlanType(rawPlan);
    if (!normalized) return humanize(rawPlan);
    if (normalized === 'self_serve_business_prolite')
      return t('codex_quota.plan_business_premium');
    if (normalized === 'pro') return t('codex_quota.plan_pro');
    if (PREMIUM_CODEX_PLAN_TYPES.has(normalized)) return t('codex_quota.plan_prolite');
    if (normalized === 'plus') return t('codex_quota.plan_plus');
    if (normalized === 'team') return t('codex_quota.plan_team');
    if (normalized === 'free') return t('codex_quota.plan_free');
    return humanize(normalized);
  }
  if (type === 'claude') {
    const key = `claude_quota.${rawPlan}`;
    const value = t(key);
    return value === key ? humanize(rawPlan) : value;
  }
  return humanize(rawPlan);
};
