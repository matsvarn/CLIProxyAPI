/**
 * One credential's ledger row: mono filename + plan, up to three window cells
 * (expandable), and ghost row actions. No card chrome — a hairline separates
 * rows, matching the target ledger design.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import { maskEmails } from '@/utils/maskEmails';
import { resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaDisplayName } from '@/utils/quota/identity';
import { formatInstantShort, formatRelativeInstant } from '@/utils/quota/relativeTime';
import { getTypeLabel } from '@/features/authFiles/constants';
import type { LedgerWindow } from '../ledgerModel';
import type { QuotaFileEntry } from '../logic';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { ledgerWindowLabel } from '../windowLabel';
import styles from './QuotaLedger.module.scss';

const VISIBLE_WINDOWS = 3;

const meterClass = (remaining: number | null): string => {
  if (remaining === null) return '';
  if (remaining >= 70) return styles.fillHigh;
  if (remaining >= 30) return styles.fillMedium;
  return styles.fillLow;
};

/** Plan/subscription line under the filename; falls back to the provider label. */
const planLabelFor = (entry: QuotaFileEntry, quota: QuotaCardState | undefined): string | null => {
  if (!quota || quota.status !== 'success') return null;
  const state = quota as unknown as Record<string, unknown>;
  switch (entry.type) {
    case 'claude':
    case 'codex':
      return typeof state.planType === 'string' && state.planType ? state.planType : null;
    case 'devin':
      return typeof state.plan === 'string' && state.plan ? state.plan : null;
    case 'xai': {
      const billing = state.billing as { planLabel?: string } | null | undefined;
      return billing?.planLabel ?? null;
    }
    case 'antigravity': {
      const subscription = state.subscription as
        | { tierName?: string | null; plan?: string | null }
        | null
        | undefined;
      return subscription?.tierName ?? subscription?.plan ?? null;
    }
    case 'meta': {
      const data = state.data as { planName?: string } | undefined;
      return data?.planName ?? null;
    }
    default:
      return null;
  }
};

const WindowCell = ({
  window,
  nowMs,
}: {
  window: LedgerWindow;
  nowMs: number;
}) => {
  const { t } = useTranslation();
  const percent = window.remaining === null ? null : Math.round(window.remaining);
  return (
    <div className={styles.windowCell}>
      <div className={styles.windowTop}>
        <span className={styles.windowLabel}>{ledgerWindowLabel(t, window)}</span>
        <span className={styles.windowPercent}>
          {percent === null ? '--' : `${percent}%`}
        </span>
      </div>
      <div className={styles.meterTrack} aria-hidden="true">
        {percent !== null && (
          <span
            className={`${styles.meterFill} ${meterClass(percent)}`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        )}
      </div>
      <span className={styles.windowReset}>
        {window.resetAtMs !== null && window.resetAtMs > nowMs
          ? `${formatRelativeInstant(window.resetAtMs, nowMs)} · ${formatInstantShort(window.resetAtMs)}`
          : t('quota_management.ledger_no_reset')}
      </span>
    </div>
  );
};

export interface QuotaLedgerRowProps {
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  windows: LedgerWindow[];
  showEmails: boolean;
  nowMs: number;
  canRefresh: boolean;
  resetting: boolean;
  onRefresh: () => void;
  onReset: () => void;
}

export function QuotaLedgerRow(props: QuotaLedgerRowProps) {
  const { entry, quota, windows, showEmails, nowMs, canRefresh, resetting, onRefresh, onReset } =
    props;
  const { t } = useTranslation();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const [expanded, setExpanded] = useState(false);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const claudeReset = useClaudeResetGrants(
    entry.file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    quota,
    onRefresh
  );

  const displayName = getQuotaDisplayName(entry.file);
  const planLabel = planLabelFor(entry, quota) ?? getTypeLabel(t, entry.type);
  const visibleWindows = expanded ? windows : windows.slice(0, VISIBLE_WINDOWS);
  const hiddenCount = windows.length - VISIBLE_WINDOWS;

  const showReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));

  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  return (
    <div className={styles.row}>
      <div className={styles.rowIdentity}>
        <span
          className={styles.rowName}
          title={showEmails ? displayName : maskEmails(displayName)}
        >
          {showEmails ? displayName : maskEmails(displayName)}
        </span>
        <span className={styles.rowPlan}>{planLabel}</span>
      </div>

      {status === 'idle' ? (
        <span className={styles.rowNote}>{t('quota_management.ledger_not_loaded')}</span>
      ) : loading ? (
        <div className={styles.rowWindows} aria-busy="true">
          <span className={styles.srOnly} />
          {[0, 1, 2].map((cell) => (
            <div key={cell} className={styles.windowCell} aria-hidden="true">
              <span className={styles.skeletonBar} style={{ width: '40%' }} />
              <span className={styles.skeletonBar} />
              <span className={styles.skeletonBar} style={{ width: '60%' }} />
            </div>
          ))}
        </div>
      ) : status === 'error' ? (
        <span className={styles.rowError} role="alert">
          {errorMessage}
        </span>
      ) : (
        <>
          <div
            className={`${styles.rowWindows} ${expanded ? styles.rowWindowsExpanded : ''}`}
          >
            {visibleWindows.map((window) => (
              <WindowCell key={window.key} window={window} nowMs={nowMs} />
            ))}
            {windows.length === 0 && (
              <span className={styles.rowNote}>{t('quota_management.ledger_no_windows')}</span>
            )}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              className={styles.rowMore}
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
            >
              {expanded
                ? t('quota_management.ledger_show_less')
                : t('quota_management.ledger_more', { count: hiddenCount })}
            </button>
          )}
        </>
      )}

      <div className={styles.rowActions}>
        {entry.type === 'claude' &&
          status !== 'idle' &&
          ((typeof claudeReset.count === 'number' && claudeReset.count > 0) ||
            claudeReset.busy ||
            Boolean(claudeReset.message)) && (
          <button
            type="button"
            className={styles.actionGhost}
            disabled={claudeReset.blocked}
            onClick={claudeReset.confirm}
            title={t(`claude_reset.${claudeReset.buttonLabel}`)}
          >
            <IconRefreshCw size={13} className={claudeReset.busy ? styles.spinning : undefined} />
            {t(`claude_reset.${claudeReset.buttonLabel}`)}
          </button>
        )}
        {showReset && (
          <button
            type="button"
            className={styles.actionGhost}
            onClick={onReset}
            disabled={!canRefresh || loading || resetting}
            title={t('codex_quota.reset_button')}
          >
            <IconRefreshCw size={13} className={resetting ? styles.spinning : undefined} />
            {t('codex_quota.reset_button')}
          </button>
        )}
        <button
          type="button"
          className={styles.actionGhost}
          onClick={onRefresh}
          disabled={!canRefresh || loading || resetting || claudeReset.busy}
          title={t('auth_files.quota_refresh_hint')}
        >
          <IconRefreshCw size={13} className={loading ? styles.spinning : undefined} />
          {t('auth_files.quota_refresh_single')}
        </button>
      </div>
    </div>
  );
}
