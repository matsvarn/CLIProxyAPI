/**
 * Session-affinity log parser and summarizer.
 *
 * Pure functions — no React, no clock of its own (`nowMs` is always passed
 * in), so every case here is directly testable.
 *
 * The backend logs one line per routing decision:
 * `[2026-07-30 07:48:16] [e87ca9ee] [info ] [selector.go:436] session-affinity: cache hit | session=msg:77445d9898e76b1b auth=codex-….json provider=mixed model=gpt-5.6-sol`
 * The phrase between `session-affinity:` and `|` decides the kind; everything
 * after `|` is space-separated key=value context.
 */

export type AffinityEventKind = 'hit' | 'bind' | 'rebind';

export interface AffinityEvent {
  /** Parsed from the local-time bracket at the head of the line. */
  atMs: number;
  requestId: string;
  kind: AffinityEventKind;
  /** The exact backend phrase that classified the event. */
  phrase: string;
  session: string;
  parent?: string;
  auth: string;
  provider: string;
  model: string;
}

export interface AffinitySummary {
  hits: number;
  binds: number;
  rebinds: number;
  /** hits / (hits + binds + rebinds), null when there is nothing to rate. */
  hitRate: number | null;
  accounts: {
    auth: string;
    /** Distinct sessions seen within `ttlMs` of `nowMs`. */
    activeSessions: number;
    hits: number;
    binds: number;
    rebinds: number;
    lastSeenMs: number;
  }[];
  sessions: {
    session: string;
    auth: string;
    provider: string;
    model: string;
    events: number;
    lastSeenMs: number;
    lastKind: AffinityEventKind;
  }[];
}

/**
 * Phrase → kind, exactly as emitted by the backend selector
 * (`sdk/cliproxy/auth/selector.go`). Order matters: the rebind phrase starts
 * with "cache hit", so it must be matched as a whole phrase, not by prefix.
 */
const KIND_PHRASES: Record<AffinityEventKind, string[]> = {
  rebind: ['cache hit but auth unavailable, reselected'],
  hit: [
    'cache hit',
    'fallback cache hit',
    'fork cache hit',
    'LCP cache hit',
    'LCP fork hit',
    'LCP compaction hit',
  ],
  bind: [
    'cache miss, new binding',
    'LCP cache miss, new binding',
    'fork bound to new auth',
    'LCP fork bound to new auth',
    'LCP compaction bound to new auth',
  ],
};

// Longest first so a phrase never gets shadowed by a shorter shared stem.
const PHRASE_KINDS: [string, AffinityEventKind][] = (
  Object.entries(KIND_PHRASES) as [AffinityEventKind, string[]][]
).flatMap(([kind, phrases]) => phrases.map((phrase) => [phrase, kind] as [string, AffinityEventKind]))
  .sort((a, b) => b[0].length - a[0].length);

const LINE_PATTERN =
  /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\] \[([^\]]*)\] \[[^\]]*\] \[[^\]]*\]\s*(.*)$/;

const AFFINITY_MARKER = 'session-affinity:';

/** Parse one log line; returns null for anything that isn't an affinity event. */
export function parseAffinityLine(line: string): AffinityEvent | null {
  const match = LINE_PATTERN.exec(line.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, requestId, message] = match;

  const markerIndex = message.indexOf(AFFINITY_MARKER);
  if (markerIndex === -1) return null;
  const rest = message.slice(markerIndex + AFFINITY_MARKER.length).trimStart();

  const pipeIndex = rest.indexOf('|');
  if (pipeIndex === -1) return null;
  const phrase = rest.slice(0, pipeIndex).trim();
  const entry = PHRASE_KINDS.find(([candidate]) => candidate === phrase);
  if (!entry) return null;

  const fields: Record<string, string> = {};
  rest
    .slice(pipeIndex + 1)
    .trim()
    .split(/\s+/)
    .forEach((pair) => {
      const eq = pair.indexOf('=');
      if (eq <= 0) return;
      fields[pair.slice(0, eq)] = pair.slice(eq + 1);
    });

  const session = fields.session ?? '';
  const auth = fields.auth ?? '';
  if (!session || !auth) return null;

  // Timestamps are written in the server's local time; construct as local.
  const atMs = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
  if (!Number.isFinite(atMs)) return null;

  return {
    atMs,
    requestId,
    kind: entry[1],
    phrase,
    session,
    parent: fields.parent ?? fields.fallback,
    auth,
    provider: fields.provider ?? '',
    model: fields.model ?? '',
  };
}

const SESSION_CAP = 50;

/** Aggregate events into per-account and per-session summaries. */
export function summarizeAffinity(
  events: readonly AffinityEvent[],
  nowMs: number,
  ttlMs: number
): AffinitySummary {
  const accounts = new Map<
    string,
    {
      auth: string;
      sessions: Map<string, number>;
      hits: number;
      binds: number;
      rebinds: number;
      lastSeenMs: number;
    }
  >();
  const sessions = new Map<
    string,
    {
      session: string;
      auth: string;
      provider: string;
      model: string;
      events: number;
      lastSeenMs: number;
      lastKind: AffinityEventKind;
    }
  >();

  let hits = 0;
  let binds = 0;
  let rebinds = 0;

  events.forEach((event) => {
    if (event.kind === 'hit') hits += 1;
    else if (event.kind === 'bind') binds += 1;
    else rebinds += 1;

    let account = accounts.get(event.auth);
    if (!account) {
      account = {
        auth: event.auth,
        sessions: new Map<string, number>(),
        hits: 0,
        binds: 0,
        rebinds: 0,
        lastSeenMs: 0,
      };
      accounts.set(event.auth, account);
    }
    if (event.kind === 'hit') account.hits += 1;
    else if (event.kind === 'bind') account.binds += 1;
    else account.rebinds += 1;
    account.lastSeenMs = Math.max(account.lastSeenMs, event.atMs);
    account.sessions.set(event.session, Math.max(account.sessions.get(event.session) ?? 0, event.atMs));

    const sessionKey = `${event.auth}${event.session}`;
    let session = sessions.get(sessionKey);
    if (!session) {
      session = {
        session: event.session,
        auth: event.auth,
        provider: event.provider,
        model: event.model,
        events: 0,
        lastSeenMs: 0,
        lastKind: event.kind,
      };
      sessions.set(sessionKey, session);
    }
    session.events += 1;
    if (event.atMs >= session.lastSeenMs) {
      session.lastSeenMs = event.atMs;
      session.lastKind = event.kind;
      session.provider = event.provider;
      session.model = event.model;
    }
  });

  const total = hits + binds + rebinds;
  return {
    hits,
    binds,
    rebinds,
    hitRate: total === 0 ? null : hits / total,
    accounts: Array.from(accounts.values())
      .map((account) => ({
        auth: account.auth,
        activeSessions: Array.from(account.sessions.values()).filter(
          (lastSeenMs) => nowMs - lastSeenMs <= ttlMs
        ).length,
        hits: account.hits,
        binds: account.binds,
        rebinds: account.rebinds,
        lastSeenMs: account.lastSeenMs,
      }))
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs || a.auth.localeCompare(b.auth)),
    sessions: Array.from(sessions.values())
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs || a.session.localeCompare(b.session))
      .slice(0, SESSION_CAP),
  };
}

/**
 * Parse a Go-style duration string (`"1h"`, `"30m"`, `"90s"`, `"1h30m"`) to
 * milliseconds. Returns null when the value is absent or unrecognized — the
 * caller decides the fallback, not the parser.
 */
export function parseDurationMs(value: string | undefined | null): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
  let total = 0;
  let matched = false;
  for (const part of text.matchAll(/(\d+(?:\.\d+)?)([smh])/g)) {
    total += Number(part[1]) * UNIT_MS[part[2]];
    matched = true;
  }
  return matched ? total : null;
}
