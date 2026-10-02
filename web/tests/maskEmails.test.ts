import { describe, expect, test } from 'bun:test';
import { maskEmails } from '@/utils/maskEmails';

describe('maskEmails', () => {
  test('masks a simple credential filename', () => {
    expect(maskEmails('claude-tom@1xyz.dev.json')).toBe('claude-t•••@1•••.dev.json');
  });

  test('keeps the prefix through the last separator and the domain tail', () => {
    expect(maskEmails('codex-2a524877-m.varnskuehler@gmail.com-pro.json')).toBe(
      'codex-2a524877-m•••@g•••.com-pro.json'
    );
  });

  test('leaves text without an address unchanged', () => {
    expect(maskEmails('auth-file.json')).toBe('auth-file.json');
    expect(maskEmails('')).toBe('');
  });

  test('masks each address in mixed text', () => {
    expect(maskEmails('a@b.co and c-d@e.io')).toBe('a•••@b•••.co and c-d•••@e•••.io');
  });
});
