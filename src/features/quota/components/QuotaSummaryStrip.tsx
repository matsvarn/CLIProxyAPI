/**
 * Provider pool summary strip: one bordered container, one column per provider
 * that has credentials in the current filter. Each column pools the provider's
 * windows across credentials (see ledgerModel.poolProvider).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedTheme } from '@/types';
import {
  formatInstantShort,
  formatRelativeInstant,
} from '@/utils/quota/relativeTime';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import type { PooledWindow, ProviderPool } from '../ledgerModel';
import { ledgerWindowLabel } from '../windowLabel';
import styles from './QuotaLedger.module.scss';

const meterClass = (remaining: number | null): string => {
  if (remaining === null) return '';
  if (remaining >= 70) return styles.fillHigh;
  if (remaining >= 30) return styles.fillMedium;
  return styles.fillLow;
};

const PooledReset = ({ pool, nowMs }: { pool: PooledWindow; nowMs: number }) => {
  if (pool.soonestResetAtMs === null) {
    return <span className={styles.stripReset}>--</span>;
  }
  return (
    <span className={styles.stripReset}>
      {formatRelativeInstant(pool.soonestResetAtMs, nowMs)} ·{' '}
      {formatInstantShort(pool.soonestResetAtMs)}
    </span>
  );
};

const StripCell = ({
  pool,
  resolvedTheme,
  nowMs,
}: {
  pool: ProviderPool;
  resolvedTheme: ResolvedTheme;
  nowMs: number;
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const provider = pool.provider;
  const iconSrc = getAuthFileIcon(provider, resolvedTheme);
  const typeLabel = getTypeLabel(t, provider);
  const headline = pool.headline;
  const visibleOthers = expanded ? pool.others : pool.others.slice(0, 1);
  const hasMore = pool.others.length > 1;

  return (
    <div className={styles.stripCell}>
      <div className={styles.stripHead}>
        <span
          className={styles.stripIconWrap}
          style={
            isThemeSurfaceIconProvider(provider)
              ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.stripIcon} />
          ) : (
            <span>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.stripName}>{typeLabel}</span>
        <span className={styles.stripCount}>
          {t('quota_management.summary_credentials', { count: pool.credentialCount })}
        </span>
      </div>

      {headline ? (
        <>
          <span className={styles.stripWindowLabel}>{ledgerWindowLabel(t, headline)}</span>
          <div className={styles.stripFigure}>
            <span className={styles.stripValue}>{Math.round(headline.remainingSum)}%</span>
            <span className={styles.stripCapacity}>
              {t('quota_management.summary_of_capacity', { capacity: headline.capacity })}
            </span>
          </div>
          <div className={styles.segments} aria-hidden="true">
            {headline.segments.map((remaining, index) => (
              <span key={index} className={styles.segment}>
                {remaining !== null && (
                  <span
                    className={`${styles.segmentFill} ${meterClass(remaining)}`}
                    style={{ width: `${Math.min(100, Math.max(0, remaining))}%` }}
                  />
                )}
              </span>
            ))}
          </div>
          <PooledReset pool={headline} nowMs={nowMs} />
        </>
      ) : (
        <span className={styles.stripReset}>{t('quota_management.ledger_not_loaded')}</span>
      )}

      {visibleOthers.length > 0 && headline && (
        <>
          <hr className={styles.stripDivider} />
          {visibleOthers.map((window) => (
            <div key={window.key} className={styles.stripOtherRow}>
              <span className={styles.stripOtherLabel}>{ledgerWindowLabel(t, window)}</span>
              <span className={styles.stripOtherValue}>{Math.round(window.remainingSum)}%</span>
              {window === visibleOthers[0] && hasMore && (
                <button
                  type="button"
                  className={styles.stripToggle}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded
                    ? t('quota_management.summary_hide')
                    : t('quota_management.summary_show')}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export interface QuotaSummaryStripProps {
  pools: ProviderPool[];
  resolvedTheme: ResolvedTheme;
  nowMs: number;
}

export function QuotaSummaryStrip({ pools, resolvedTheme, nowMs }: QuotaSummaryStripProps) {
  const visible = pools.filter((pool) => pool.credentialCount > 0);
  if (visible.length === 0) return null;
  return (
    <div className={styles.strip}>
      {visible.map((pool) => (
        <StripCell key={pool.provider} pool={pool} resolvedTheme={resolvedTheme} nowMs={nowMs} />
      ))}
    </div>
  );
}
