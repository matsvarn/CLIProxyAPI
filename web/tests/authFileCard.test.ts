import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The row binds CSS-module classes at import time, which Bun cannot render.
// Keep these source contracts small; browser checks cover the actual row interactions.
const source = readFileSync(
  new URL('../src/features/authFiles/components/AuthFileRow.tsx', import.meta.url),
  'utf8'
);
const styles = readFileSync(
  new URL('../src/features/authFiles/components/AuthFileRow.module.scss', import.meta.url),
  'utf8'
);

describe('auth file row presentation contract', () => {
  test('uses identity masking, provider icon and a status dot + word', () => {
    expect(source).toContain('<img');
    expect(source).toContain('getAuthFileIcon');
    expect(source).toContain('maskEmails(identity.primary)');
    expect(source).toContain('maskEmails(rawSecondary');
    expect(source).toContain('usePrivacyStore');
    expect(source).toContain('dotSuccess');
    expect(source).toContain('dotDanger');
    expect(source).toContain('dotMuted');
  });

  test('uses one row toggle and credential-specific accessible names', () => {
    expect(source.match(/<ToggleSwitch/g)).toHaveLength(1);
    expect(source).toContain("ariaLabel={t('auth_files.card_select', { name: file.name })}");
    expect(source).toContain("t('auth_files.card_toggle', { name: file.name })");
    expect(source).toContain('checked={!file.disabled}');
    expect(source).toContain('statusUpdating[getAuthFileRefreshKey(file)] === true ||');
    expect(source).toContain('isManualRefreshing');
    expect(source).toContain('!isRuntimeOnly &&');
  });

  test('row stays a single hairline-divided line without per-row cards', () => {
    expect(styles).toContain('border-bottom: 1px solid var(--border-color)');
    expect(styles).not.toMatch(/\.row \{[^}]*border-radius/);
  });

  test('retains individual management actions', () => {
    for (const handler of [
      'onShowModels(file)',
      'onDownload(file.name)',
      'onManualRefresh(file)',
      'onOpenPrefixProxyEditor(file)',
      'onDelete(file.name)',
    ]) {
      expect(source).toContain(handler);
    }
    expect(source).toContain('showManualRefreshButton');
    expect(source).toContain('file.disabled ||');
  });
});
