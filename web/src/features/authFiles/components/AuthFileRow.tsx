import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconDownload,
  IconModelCluster,
  IconRefreshCw,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import type { AuthFileItem } from '@/types';
import { maskEmails } from '@/utils/maskEmails';
import { formatRelativeInstant } from '@/utils/quota/relativeTime';
import { useNow } from '@/hooks/useNow';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  getAuthFileStatusMessage,
  isProblemAuthFile,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  supportsAuthFileManualRefresh,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { getAuthFileRefreshKey } from '@/features/authFiles/manualRefresh';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { usePrivacyStore } from '@/stores';
import styles from './AuthFileRow.module.scss';

export type AuthFileRowProps = {
  file: AuthFileItem;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: string | null;
  statusUpdating: Record<string, boolean>;
  manualRefreshing: Record<string, boolean>;
  onShowModels: (file: AuthFileItem) => void;
  onDownload: (name: string) => void;
  onManualRefresh: (file: AuthFileItem) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const modifiedMs = (file: AuthFileItem): number | null => {
  const raw = file['modtime'] ?? file.modified;
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && !Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? null : parsed;
};

/** One account row inside the bordered list panel (Vercel deployments style). */
export function AuthFileRow(props: AuthFileRowProps) {
  const { t } = useTranslation();
  const showEmails = usePrivacyStore((state) => state.showEmails);
  const {
    file,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    manualRefreshing,
    onShowModels,
    onDownload,
    onManualRefresh,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? 'unknown'));
  const isAistudio = providerKey === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const showManualRefreshButton = !isRuntimeOnly && supportsAuthFileManualRefresh(providerKey);
  const isManualRefreshing = manualRefreshing[getAuthFileRefreshKey(file)] === true;
  const iconSrc = getAuthFileIcon(providerKey, resolvedTheme);

  const identity = deriveAuthFileIdentity(file);
  const primary = showEmails ? identity.primary : maskEmails(identity.primary);
  const secondary = showEmails ? identity.secondary : maskEmails(identity.secondary ?? '');
  const statusMessage = getAuthFileStatusMessage(file);
  const statusWord = file.disabled
    ? t('auth_files.row_status_disabled')
    : isProblemAuthFile(file)
      ? t('auth_files.row_status_problem')
      : t('auth_files.row_status_active');
  const statusTone = file.disabled
    ? styles.dotMuted
    : isProblemAuthFile(file)
      ? styles.dotDanger
      : styles.dotSuccess;

  const successCount = file.successCount ?? 0;
  const failureCount = file.failureCount ?? 0;
  const nowMs = useNow();
  const modMs = modifiedMs(file);

  return (
    <div className={`${styles.row} ${selected ? styles.rowSelected : ''}`}>
      {!isRuntimeOnly && (
        <SelectionCheckbox
          checked={selected}
          onChange={() => onToggleSelect(file.name)}
          className={styles.selection}
          ariaLabel={t('auth_files.card_select', { name: file.name })}
          title={t('auth_files.card_select', { name: file.name })}
        />
      )}

      {iconSrc ? (
        <img src={iconSrc} alt="" className={styles.providerIcon} />
      ) : (
        <span className={styles.providerIconFallback} aria-hidden="true" />
      )}

      <div className={styles.identity}>
        <span className={styles.primary} title={primary}>
          {primary}
        </span>
        {secondary ? (
          <span className={styles.fileName} title={secondary}>
            {secondary}
          </span>
        ) : null}
      </div>

      <span className={styles.status} title={statusMessage || undefined}>
        <i className={`${styles.dot} ${statusTone}`} aria-hidden="true" />
        {statusWord}
      </span>

      <span className={styles.counts} title={`${t('stats.success')} / ${t('stats.failure')}`}>
        <span className={styles.countOk}>{successCount.toLocaleString()}</span>
        <span className={styles.countDivider}>/</span>
        <span className={styles.countFail}>{failureCount.toLocaleString()}</span>
      </span>

      <span className={styles.modified}>
        {modMs ? formatRelativeInstant(modMs, nowMs) : '—'}
      </span>

      <div className={styles.actions}>
        {showModelsButton && (
          <button
            type="button"
            className={styles.iconAction}
            onClick={() => onShowModels(file)}
            title={t('auth_files.models_button')}
            aria-label={t('auth_files.models_button')}
            disabled={disableControls}
          >
            <IconModelCluster size={15} />
          </button>
        )}
        {!isRuntimeOnly && (
          <>
            {showManualRefreshButton && (
              <button
                type="button"
                className={styles.iconAction}
                onClick={() => onManualRefresh(file)}
                title={t('auth_files.manual_refresh_button')}
                aria-label={t('auth_files.manual_refresh_button')}
                disabled={
                  disableControls ||
                  file.disabled ||
                  statusUpdating[getAuthFileRefreshKey(file)] === true ||
                  isManualRefreshing
                }
              >
                {isManualRefreshing ? <LoadingSpinner size={14} /> : <IconRefreshCw size={15} />}
              </button>
            )}
            <button
              type="button"
              className={styles.iconAction}
              onClick={() => onDownload(file.name)}
              title={t('auth_files.download_button')}
              aria-label={t('auth_files.download_button')}
              disabled={disableControls}
            >
              <IconDownload size={15} />
            </button>
            <button
              type="button"
              className={styles.iconAction}
              onClick={() => onOpenPrefixProxyEditor(file)}
              title={t('auth_files.prefix_proxy_button')}
              aria-label={t('auth_files.prefix_proxy_button')}
              disabled={disableControls || isManualRefreshing}
            >
              <IconSettings size={15} />
            </button>
            <button
              type="button"
              className={`${styles.iconAction} ${styles.iconDanger}`}
              onClick={() => onDelete(file.name)}
              title={t('auth_files.delete_button')}
              aria-label={t('auth_files.delete_button')}
              disabled={disableControls || deleting === file.name || isManualRefreshing}
            >
              {deleting === file.name ? <LoadingSpinner size={14} /> : <IconTrash2 size={15} />}
            </button>
            <ToggleSwitch
              ariaLabel={t('auth_files.card_toggle', { name: file.name })}
              checked={!file.disabled}
              disabled={
                disableControls ||
                statusUpdating[getAuthFileRefreshKey(file)] === true ||
                isManualRefreshing
              }
              onChange={(value) => onToggleStatus(file, value)}
            />
          </>
        )}
      </div>
      <span className={styles.srOnly}>{getQuotaCacheKey(file)}</span>
    </div>
  );
}
