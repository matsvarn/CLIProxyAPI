/**
 * Ledger list: one section per provider present in the filtered entries,
 * rows sorted exactly as the page sorted them.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getTypeLabel } from '@/features/authFiles/constants';
import {
  ledgerWindowsFor,
  orderLedgerWindows,
  type ProviderPool,
} from '../ledgerModel';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import { QUOTA_TAB_ORDER } from '../constants';
import type { QuotaProviderType } from '../providers/types';
import { QuotaLedgerRow } from './QuotaLedgerRow';
import styles from './QuotaLedger.module.scss';

export interface QuotaLedgerProps {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  pools: Map<QuotaProviderType, ProviderPool>;
  showEmails: boolean;
  nowMs: number;
  canRefresh: boolean;
  resettingName: string | null;
  cacheKeyFor: (entry: QuotaFileEntry) => string;
  onRefresh: (entry: QuotaFileEntry) => void;
  onReset: (entry: QuotaFileEntry) => void;
}

export function QuotaLedger(props: QuotaLedgerProps) {
  const { entries, quotaFor, pools, showEmails, nowMs, canRefresh, resettingName } = props;
  const { cacheKeyFor, onRefresh, onReset } = props;
  const { t } = useTranslation();

  const sections = useMemo(
    () =>
      QUOTA_TAB_ORDER.map((provider) => ({
        provider,
        entries: entries.filter((entry) => entry.type === provider),
      })).filter((section) => section.entries.length > 0),
    [entries]
  );

  return (
    <div className={styles.ledger}>
      {sections.map((section) => (
        <section key={section.provider} className={styles.ledgerSection}>
          <div className={styles.ledgerSectionHead}>
            <span className={styles.ledgerProvider}>{getTypeLabel(t, section.provider)}</span>
            <span className={styles.ledgerCount}>{section.entries.length}</span>
          </div>
          {section.entries.map((entry) => {
            const quota = quotaFor(entry);
            const windows =
              quota && quota.status === 'success'
                ? orderLedgerWindows(
                    ledgerWindowsFor(entry.type, quota),
                    pools.get(entry.type)?.headline?.key ?? null
                  )
                : [];
            return (
              <QuotaLedgerRow
                key={cacheKeyFor(entry)}
                entry={entry}
                quota={quota}
                windows={windows}
                showEmails={showEmails}
                nowMs={nowMs}
                canRefresh={canRefresh && !entry.file.disabled}
                resetting={resettingName === cacheKeyFor(entry)}
                onRefresh={() => onRefresh(entry)}
                onReset={() => onReset(entry)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
