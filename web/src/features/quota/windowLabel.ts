import type { TFunction } from 'i18next';
import type { LedgerWindow } from './ledgerModel';

/** Localized label for a ledger/pooled window: translated key when present, raw label else. */
export const ledgerWindowLabel = (
  t: TFunction,
  window: Pick<LedgerWindow, 'label' | 'labelKey' | 'labelParams'>
): string => (window.labelKey ? t(window.labelKey, window.labelParams) : window.label);
