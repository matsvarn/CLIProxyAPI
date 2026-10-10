import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import en from '@/i18n/locales/en.json';
import { AuthFileRow } from '@/features/authFiles/components/AuthFileRow';
import type { AuthFileItem } from '@/types';

const translations = createInstance();
await translations.init({ lng: 'en', resources: { en: { translation: en } } });
const noop = () => {};
const file: AuthFileItem = {
  name: 'claude-reset-account.json',
  type: 'claude',
  authIndex: 'reset-account-index',
  status: 'error',
  cooldownSnapshot: {
    observedAt: new Date().toISOString(),
    receivedAtMs: Date.now(),
    records: [
      {
        scope: 'model',
        modelKey: 'claude-opus-5-5',
        reason: 'quota',
        retryAt: new Date(Date.now() + 3600000).toISOString(),
        remainingSeconds: 3600,
        httpStatus: 429,
      },
    ],
  },
};
const render = (item: AuthFileItem, pending = false, disableControls = false) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: translations },
      createElement(AuthFileRow, {
        file: item,
        selected: false,
        resolvedTheme: 'dark',
        disableControls,
        deleting: null,
        statusUpdating: {},
        manualRefreshing: {},
        cooldownResetting: pending ? { 'reset-account-index': true } : {},
        onCooldownReset: noop,
        onShowModels: noop,
        onDownload: noop,
        onManualRefresh: noop,
        onOpenPrefixProxyEditor: noop,
        onDelete: noop,
        onToggleStatus: noop,
        onToggleSelect: noop,
      })
    )
  );

describe('Accounts cooldown recovery', () => {
  test('shows an actionable reset in the account row before the collapsed details', () => {
    const markup = render(file);
    const button = markup.match(/<button[^>]*>[\s\S]*?Clear cooldown[\s\S]*?<\/button>/)?.[0];
    expect(button).toBeTruthy();
    expect(button).not.toContain('disabled=""');
    expect(markup.indexOf('Clear cooldown')).toBeLessThan(markup.indexOf('<details'));
    expect(markup).toContain('claude-opus-5-5');
  });

  test('does not offer a reset without known cooldown state or a credential index', () => {
    for (const item of [
      { ...file, cooldownSnapshot: undefined },
      { ...file, cooldownSnapshot: { ...file.cooldownSnapshot!, records: [] } },
      { ...file, cooldownSnapshot: { ...file.cooldownSnapshot!, records: null } },
      { ...file, authIndex: '' },
    ])
      expect(render(item)).not.toContain('Clear cooldown');
  });

  test('blocks duplicate resets and writes while disconnected or disabled', () => {
    for (const markup of [
      render(file, true),
      render(file, false, true),
      render({ ...file, disabled: true }),
    ]) {
      const button = markup.match(/<button[^>]*title="[^"]*cooldown[^"]*"[^>]*>/)?.[0];
      expect(button).toContain('disabled=""');
    }
  });
});
