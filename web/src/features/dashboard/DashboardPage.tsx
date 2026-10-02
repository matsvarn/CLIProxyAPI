import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useThemeStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { getAuthFileIcon } from '@/features/authFiles/constants';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatStrip } from '@/components/layout/StatStrip';
import { formatPercent } from '@/utils/format';
import { isRecord } from '@/utils/helpers';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import { ThroughputChart } from './components/ThroughputChart';
import { providerLabel, splitWindowMinutes } from './utils';
import styles from './dashboard.module.scss';

const DASH = '—';

const formatHeadline = (value: number): string => value.toLocaleString();

export function DashboardPage() {
  const { t } = useTranslation();
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const { connectionStatus, connected, config, counts, traffic, providers, credentials, refresh } =
    useDashboardOverview();

  useHeaderRefresh(refresh, connected);

  const windowLabel = useMemo(() => {
    if (traffic.windowMinutes <= 0) return DASH;
    const { hours, minutes } = splitWindowMinutes(traffic.windowMinutes);
    if (hours === 0) return t('dashboard.window_m', { minutes });
    if (minutes === 0) return t('dashboard.window_h', { hours });
    return t('dashboard.window_hm', { hours, minutes });
  }, [traffic.windowMinutes, t]);

  const routingStrategy = useMemo(() => {
    const raw = config?.routingStrategy?.trim() ?? '';
    if (!raw) return DASH;
    if (raw === 'round-robin') return t('basic_settings.routing_strategy_round_robin');
    if (raw === 'weighted-round-robin') {
      return t('basic_settings.routing_strategy_weighted_round_robin');
    }
    if (raw === 'fill-first') return t('basic_settings.routing_strategy_fill_first');
    return raw;
  }, [config?.routingStrategy, t]);

  const unknownProviderLabel = t('dashboard.provider_unknown');

  const connectionLabel = t(
    connectionStatus === 'connected'
      ? 'common.connected'
      : connectionStatus === 'connecting'
        ? 'common.connecting'
        : 'common.disconnected'
  );
  const versionLabel = serverVersion ? `v${serverVersion.trim().replace(/^[vV]+/, '')}` : null;
  const headerMeta = [versionLabel, connectionLabel].filter(Boolean).join(' · ');

  const routingSection = isRecord(config?.raw?.routing)
    ? (config.raw.routing as Record<string, unknown>)
    : {};
  const affinityOn = routingSection['session-affinity'] === true;
  const affinityTtl =
    typeof routingSection['session-affinity-ttl'] === 'string' &&
    routingSection['session-affinity-ttl']
      ? routingSection['session-affinity-ttl']
      : '1h';

  const accountProblems = credentials ? credentials.disabled + credentials.unavailable : 0;
  const accountsValue = credentials ? (
    <>
      {credentials.active.toLocaleString()} / {credentials.total.toLocaleString()}
      {accountProblems > 0 && (
        <span className={styles.valueDanger}> · {accountProblems.toLocaleString()}</span>
      )}
    </>
  ) : (
    DASH
  );

  const configRows: Array<{ label: string; value: React.ReactNode; mono?: boolean }> = [
    { label: t('dashboard.runtime_routing'), value: routingStrategy },
    {
      label: t('dashboard.runtime_affinity'),
      value: (
        <Link to="/routing" className={styles.rowLink}>
          {affinityOn
            ? `${t('dashboard.runtime_enabled')} · ${affinityTtl}`
            : t('dashboard.runtime_disabled')}
        </Link>
      ),
    },
    { label: t('dashboard.runtime_retry'), value: String(config?.requestRetry ?? 0) },
    {
      label: t('dashboard.runtime_file_logging'),
      value: config ? t(config.loggingToFile ? 'dashboard.runtime_enabled' : 'dashboard.runtime_disabled') : DASH,
    },
    {
      label: t('dashboard.runtime_request_log'),
      value: config ? t(config.requestLog ? 'dashboard.runtime_enabled' : 'dashboard.runtime_disabled') : DASH,
    },
    {
      label: t('dashboard.runtime_debug'),
      value: config ? t(config.debug ? 'dashboard.runtime_enabled' : 'dashboard.runtime_disabled') : DASH,
    },
    {
      label: t('dashboard.runtime_version'),
      value: serverVersion?.trim() || DASH,
      mono: true,
    },
    { label: t('dashboard.runtime_proxy'), value: config?.proxyUrl?.trim() || DASH, mono: true },
  ];

  return (
    <div className={styles.page}>
      <PageHeader title={t('dashboard.page_title')} meta={headerMeta} />

      <StatStrip
        cells={[
          {
            label: t('dashboard.stat_requests_window', { window: windowLabel }),
            value: connected ? formatHeadline(traffic.total) : DASH,
          },
          {
            label: t('dashboard.success_rate'),
            value: traffic.successRate === null ? DASH : formatPercent(traffic.successRate),
          },
          { label: t('dashboard.stat_accounts'), value: accountsValue, danger: false },
          {
            label: t('dashboard.stat_models'),
            value: counts.models === null ? DASH : counts.models.toLocaleString(),
          },
        ]}
      />

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{t('dashboard.requests_title')}</h2>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <i className={`${styles.dot} ${styles.dotSuccess}`} aria-hidden="true" />
              {t('stats.success')}
              <b className={styles.legendValue}>{traffic.totalSuccess.toLocaleString()}</b>
            </span>
            <span className={styles.legendItem}>
              <i className={`${styles.dot} ${styles.dotFailure}`} aria-hidden="true" />
              {t('stats.failure')}
              <b className={styles.legendValue}>{traffic.totalFailure.toLocaleString()}</b>
            </span>
          </div>
        </header>
        <ThroughputChart traffic={traffic} />
      </section>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{t('dashboard.providers_title')}</h2>
          </header>
          {providers.length === 0 ? (
            <p className={styles.emptyNote}>{t('dashboard.fleet_empty')}</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('dashboard.col_provider')}</th>
                  <th scope="col" className={styles.colNum}>
                    {t('dashboard.col_accounts')}
                  </th>
                  <th scope="col" className={styles.colNum}>
                    {t('dashboard.col_requests')}
                  </th>
                  <th scope="col" className={styles.colNum}>
                    {t('dashboard.success_rate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <th scope="row" className={styles.providerCell}>
                      {(() => {
                        const icon = getAuthFileIcon(provider.id, resolvedTheme);
                        return icon ? (
                          <img src={icon} alt="" className={styles.providerIcon} />
                        ) : null;
                      })()}
                      {providerLabel(provider.id, unknownProviderLabel)}
                    </th>
                    <td className={styles.colNum}>{provider.credentials.toLocaleString()}</td>
                    <td className={styles.colNum}>{provider.total.toLocaleString()}</td>
                    <td className={styles.colNum}>
                      {provider.successRate === null
                        ? DASH
                        : formatPercent(provider.successRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{t('dashboard.configuration_title')}</h2>
            <Link to="/config" className={styles.editLink}>
              {t('dashboard.edit')}
            </Link>
          </header>
          <dl className={styles.specList}>
            {configRows.map((row) => (
              <div key={row.label} className={styles.specRow}>
                <dt className={styles.specLabel}>{row.label}</dt>
                <dd className={`${styles.specValue} ${row.mono ? styles.mono : ''}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
