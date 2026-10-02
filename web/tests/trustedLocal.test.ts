import { describe, expect, test } from 'bun:test';
import { shouldProbeTrustedLocal } from '@/utils/trustedLocal';

describe('trusted local panel probe gate', () => {
  test('probes when the backend serves the panel on the same origin', () => {
    expect(
      shouldProbeTrustedLocal('http://127.0.0.1:8317', {
        origin: 'http://127.0.0.1:8317',
        pathname: '/management.html',
      })
    ).toBe(true);
  });

  test('does not probe inside the Vite dev server', () => {
    expect(
      shouldProbeTrustedLocal('http://127.0.0.1:8317', {
        origin: 'http://localhost:5173',
        pathname: '/',
      })
    ).toBe(false);
    expect(
      shouldProbeTrustedLocal('http://localhost:5173', {
        origin: 'http://localhost:5173',
        pathname: '/',
      })
    ).toBe(false);
  });

  test('does not probe when the stored apiBase points elsewhere', () => {
    expect(
      shouldProbeTrustedLocal('https://remote.example.com', {
        origin: 'http://127.0.0.1:8317',
        pathname: '/management.html',
      })
    ).toBe(false);
    expect(
      shouldProbeTrustedLocal('', {
        origin: 'http://127.0.0.1:8317',
        pathname: '/management.html',
      })
    ).toBe(false);
  });

  test('does not probe other paths on the same origin', () => {
    expect(
      shouldProbeTrustedLocal('http://127.0.0.1:8317', {
        origin: 'http://127.0.0.1:8317',
        pathname: '/',
      })
    ).toBe(false);
  });
});
