/**
 * Routing 页：会话亲和（prompt cache 按上游账号复用）的设置与活动观测。
 *
 * - 设置卡直接写 v8 config 字段（保存即生效，随后刷新 config store）；
 * - 活动区从 observability/logs 增量解析 `session-affinity:` 行，
 *   聚合出命中率 / 账号绑定 / 会话列表（见 affinityLog.ts）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconEye, IconEyeOff } from '@/components/ui/icons';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { configApi } from '@/services/api/config';
import { logsApi } from '@/services/api/logs';
import { useAuthStore, useConfigStore, useNotificationStore, usePrivacyStore } from '@/stores';
import { isRecord } from '@/utils/helpers';
import { maskEmails } from '@/utils/maskEmails';
import { formatInstantShort, formatRelativeInstant } from '@/utils/quota/relativeTime';
import { useNow } from '@/hooks/useNow';
import {
  parseAffinityLine,
  parseDurationMs,
  summarizeAffinity,
  type AffinityEvent,
} from './affinityLog';
import styles from './RoutingPage.module.scss';

const TTL_PRESETS = ['30m', '1h', '2h', '6h'] as const;
const STRATEGIES = ['round-robin', 'weighted-round-robin', 'fill-first'] as const;
const INITIAL_LOG_LIMIT = 5000;
const POLL_INTERVAL_MS = 10_000;

const routingSection = (config: { raw?: Record<string, unknown> } | null) =>
  isRecord(config?.raw?.routing) ? (config.raw.routing as Record<string, unknown>) : {};

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

export function RoutingPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showEmails = usePrivacyStore((state) => state.showEmails);
  const toggleShowEmails = usePrivacyStore((state) => state.toggleShowEmails);
  const nowMs = useNow();

  const routing = routingSection(config);
  const affinity = routing['session-affinity'] === true;
  const subagents = routing['session-affinity-subagents'] !== false;
  const ttl = readString(routing['session-affinity-ttl']) || '1h';
  const strategy = readString(config?.routingStrategy) || 'round-robin';
  const loggingToFile = config?.loggingToFile === true;
  const ttlMs = parseDurationMs(ttl) ?? 3_600_000;

  const [saving, setSaving] = useState<string | null>(null);
  const [ttlDraft, setTtlDraft] = useState('');
  const [events, setEvents] = useState<AffinityEvent[]>([]);
  const [logsError, setLogsError] = useState('');
  const cursorRef = useRef<string | undefined>(undefined);
  const requestRef = useRef(0);

  const save = useCallback(
    async (key: string, write: () => Promise<unknown>) => {
      if (saving) return;
      setSaving(key);
      try {
        await write();
        await fetchConfig(true);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : t('common.unknown_error');
        showNotification(`${t('routing.save_failed')}: ${message}`, 'error');
      } finally {
        setSaving(null);
      }
    },
    [fetchConfig, saving, showNotification, t]
  );

  const customTtl = TTL_PRESETS.includes(ttl as (typeof TTL_PRESETS)[number]) ? '' : ttl;

  // TTL 自定义输入是本地草稿：仅当后端值变化时回填，避免正在输入时被配置快照覆盖。
  useEffect(() => {
    setTtlDraft(customTtl);
  }, [customTtl]);

  const ttlDraftError = ttlDraft.trim() !== '' && parseDurationMs(ttlDraft) === null;
  const commitTtlDraft = () => {
    const value = ttlDraft.trim();
    if (value === '' || parseDurationMs(value) === null || value === ttl) return;
    void save('ttl', () => configApi.updateSessionAffinityTtl(value));
  };

  /* ---------- 日志拉取：首屏大窗口，之后按 cursor 增量轮询 ---------- */

  const loadEvents = useCallback(
    async (incremental: boolean) => {
      const requestId = ++requestRef.current;
      try {
        const response = await logsApi.fetchLogs(
          incremental && cursorRef.current
            ? { limit: INITIAL_LOG_LIMIT, cursor: cursorRef.current }
            : { limit: INITIAL_LOG_LIMIT }
        );
        if (requestId !== requestRef.current) return;
        if (response.nextCursor !== undefined) cursorRef.current = response.nextCursor;
        const parsed = response.lines
          .map((line) => parseAffinityLine(line))
          .filter((event): event is AffinityEvent => event !== null);
        // 轮询期间只保留最近 20,000 条亲和事件，避免长驻页面内存无界增长。
        setEvents((prev) =>
          (response.cursorReset ? parsed : [...prev, ...parsed]).slice(-20_000)
        );
        setLogsError('');
      } catch (error: unknown) {
        if (requestId !== requestRef.current) return;
        setLogsError(error instanceof Error ? error.message : t('routing.logs_error'));
      }
    },
    [t]
  );

  useEffect(() => {
    cursorRef.current = undefined;
    setEvents([]);
    if (connectionStatus !== 'connected' || !loggingToFile) return;
    void loadEvents(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadEvents(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [connectionStatus, loggingToFile, loadEvents]);

  const summary = summarizeAffinity(events, nowMs, ttlMs);
  const oldestEventMs = events.length
    ? events.reduce((min, event) => Math.min(min, event.atMs), events[0].atMs)
    : null;

  const metaLine = [
    t(`basic_settings.routing_strategy_${strategy.replace(/-/g, '_')}`),
    affinity ? t('routing.affinity_on') : t('routing.affinity_off'),
    ttl,
  ].join(' · ');

  const displayAuth = (auth: string) => (showEmails ? auth : maskEmails(auth));

  const kindLabel = (kind: AffinityEvent['kind']) => t(`routing.kind_${kind}`);
  const kindClass = (kind: AffinityEvent['kind']) =>
    kind === 'hit' ? styles.kindHit : kind === 'bind' ? styles.kindBind : styles.kindRebind;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.copy}>
          <h1 className={styles.title}>{t('routing.title')}</h1>
          <p className={styles.meta}>{metaLine}</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghostAction}
            onClick={toggleShowEmails}
            aria-pressed={showEmails}
            title={t('quota_management.show_emails_hint')}
          >
            {showEmails ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            {t(showEmails ? 'quota_management.hide_emails' : 'quota_management.show_emails')}
          </button>
        </div>
      </header>

      {!affinity && (
        <div className={styles.callout} role="status">
          <IconAlertTriangle size={15} aria-hidden="true" />
          {t('routing.affinity_off_warning')}
        </div>
      )}

      <section className={styles.panel} aria-label={t('routing.settings_aria')}>
        <h2 className={styles.panelTitle}>{t('routing.settings_title')}</h2>

        <div className={styles.settingRow}>
          <div className={styles.settingLabel}>
            {t('routing.affinity_label')}
            <ToggleSwitch
              checked={affinity}
              disabled={saving !== null}
              ariaLabel={t('routing.affinity_label')}
              onChange={(value) => void save('affinity', () => configApi.updateSessionAffinity(value))}
            />
          </div>
          <p className={styles.settingHint}>{t('routing.affinity_hint')}</p>
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingLabel}>
            {t('routing.subagents_label')}
            <ToggleSwitch
              checked={subagents}
              disabled={saving !== null || !affinity}
              ariaLabel={t('routing.subagents_label')}
              onChange={(value) =>
                void save('subagents', () => configApi.updateSessionAffinitySubagents(value))
              }
            />
          </div>
          <p className={styles.settingHint}>{t('routing.subagents_hint')}</p>
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingLabel}>{t('routing.ttl_label')}</div>
          <p className={styles.settingHint}>{t('routing.ttl_hint')}</p>
          <div className={styles.segmented} role="group" aria-label={t('routing.ttl_label')}>
            {TTL_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.segmentedItem}
                aria-pressed={ttl === preset}
                disabled={saving !== null}
                onClick={() => void save('ttl', () => configApi.updateSessionAffinityTtl(preset))}
              >
                {preset}
              </button>
            ))}
            <input
              className={`${styles.customInput} ${ttlDraftError ? styles.customInputError : ''}`}
              value={ttlDraft}
              placeholder={t('routing.ttl_custom_placeholder')}
              aria-label={t('routing.ttl_custom_label')}
              aria-invalid={ttlDraftError}
              disabled={saving !== null}
              onChange={(event) => setTtlDraft(event.target.value)}
              onBlur={commitTtlDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  setTtlDraft(customTtl);
                }
              }}
            />
          </div>
        </div>

        <div className={styles.settingRow}>
          <div className={styles.settingLabel}>{t('routing.strategy_label')}</div>
          <p className={styles.settingHint}>{t('routing.strategy_hint')}</p>
          <div className={styles.segmented} role="group" aria-label={t('routing.strategy_label')}>
            {STRATEGIES.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.segmentedItem}
                aria-pressed={strategy === option}
                disabled={saving !== null}
                onClick={() => void save('strategy', () => configApi.updateRoutingStrategy(option))}
              >
                {t(`basic_settings.routing_strategy_${option.replace(/-/g, '_')}`)}
              </button>
            ))}
          </div>
          <p className={styles.settingHint}>
            {t(`routing.strategy_${strategy.replace(/-/g, '_')}_desc`)}
          </p>
        </div>
      </section>

      {!loggingToFile ? (
        <div className={styles.callout} role="status">
          <IconAlertTriangle size={15} aria-hidden="true" />
          {t('routing.file_logging_required')}
          <button
            type="button"
            className={styles.calloutAction}
            disabled={saving !== null}
            onClick={() => void save('logging', () => configApi.updateLoggingToFile(true))}
          >
            {t('routing.enable_file_logging')}
          </button>
        </div>
      ) : (
        <section className={styles.panel} aria-label={t('routing.activity_aria')}>
          <h2 className={styles.panelTitle}>{t('routing.activity_title')}</h2>
          <p className={styles.panelDesc}>
            {oldestEventMs === null
              ? t('routing.activity_source_none', { limit: INITIAL_LOG_LIMIT })
              : t('routing.activity_source', {
                  count: events.length,
                  since: formatInstantShort(oldestEventMs),
                })}
          </p>
          {logsError && <p className={styles.panelDesc}>{logsError}</p>}

          <div className={styles.statsRow}>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('routing.stat_hit_rate')}</span>
              <span className={styles.statValue}>
                {summary.hitRate === null ? '—' : `${Math.round(summary.hitRate * 100)}%`}
              </span>
              <span className={styles.statHint}>{t('routing.stat_hit_rate_hint')}</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('routing.stat_hits')}</span>
              <span className={styles.statValue}>{summary.hits}</span>
              <span className={styles.statHint}>{t('routing.stat_hits_hint')}</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('routing.stat_binds')}</span>
              <span className={styles.statValue}>{summary.binds}</span>
              <span className={styles.statHint}>{t('routing.stat_binds_hint')}</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>{t('routing.stat_rebinds')}</span>
              <span className={styles.statValue}>{summary.rebinds}</span>
              <span className={styles.statHint}>{t('routing.stat_rebinds_hint')}</span>
            </div>
          </div>

          {summary.accounts.length === 0 ? (
            <p className={styles.empty}>{t('routing.activity_empty')}</p>
          ) : (
            <>
              <div>
                <h3 className={styles.panelTitle}>{t('routing.accounts_title')}</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('routing.col_account')}</th>
                      <th>{t('routing.col_active_sessions')}</th>
                      <th>{t('routing.col_hits')}</th>
                      <th>{t('routing.col_binds')}</th>
                      <th>{t('routing.col_rebinds')}</th>
                      <th>{t('routing.col_last_seen')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.accounts.map((account) => (
                      <tr key={account.auth}>
                        <td className={styles.mono} title={displayAuth(account.auth)}>
                          {displayAuth(account.auth)}
                        </td>
                        <td className={styles.strong}>{account.activeSessions}</td>
                        <td className={styles.strong}>{account.hits}</td>
                        <td className={styles.strong}>{account.binds}</td>
                        <td className={styles.strong}>{account.rebinds}</td>
                        <td className={styles.muted}>
                          {formatRelativeInstant(account.lastSeenMs, nowMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className={styles.panelTitle}>{t('routing.sessions_title')}</h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('routing.col_session')}</th>
                      <th>{t('routing.col_account')}</th>
                      <th>{t('routing.col_provider_model')}</th>
                      <th>{t('routing.col_events')}</th>
                      <th>{t('routing.col_last_seen')}</th>
                      <th>{t('routing.col_last_event')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.sessions.map((session) => (
                      <tr key={`${session.auth}${session.session}`}>
                        <td className={styles.mono}>{session.session}</td>
                        <td className={styles.mono} title={displayAuth(session.auth)}>
                          {displayAuth(session.auth)}
                        </td>
                        <td className={styles.muted}>
                          {[session.provider, session.model].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className={styles.strong}>{session.events}</td>
                        <td className={styles.muted}>
                          {formatRelativeInstant(session.lastSeenMs, nowMs)}
                        </td>
                        <td className={kindClass(session.lastKind)}>{kindLabel(session.lastKind)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
