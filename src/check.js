// The whole client: one POST to the free citedby.eu check, and what its answer means. No dependencies.
import { readFileSync } from 'node:fs';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const DEFAULT_API = 'https://citedby.eu/api/check';
export const REPO_URL = 'https://github.com/resaleiq/citedby-check';
export const LANGS = ['en', 'fr', 'de', 'es', 'nl'];

const COUNTED = new Set(['pass', 'fail', 'warn']);

export function buildRequest({ target, lang = 'en', source = 'cli', apiUrl = DEFAULT_API }) {
  return {
    url: apiUrl,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': `citedby-check/${VERSION} (+${REPO_URL})`,
      },
      body: JSON.stringify({ url: target, lang, source }),
    },
  };
}

/** What can be sent at all. The server normalises the rest and refuses private hosts, so it stays the authority. */
function cleanTarget(raw) {
  const t = String(raw ?? '').trim();
  if (!t || t.length > 300 || /\s/.test(t)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) return null; // file:, ftp:, javascript: and host:port (the check reads ports 80 and 443 only)
  return t;
}

/**
 * Asks citedby.eu to check one public site.
 * Resolves { ok: true, result } or { ok: false, reason, status? }; it never throws and never invents a pass.
 * reason: bad_url, rate_limited, busy (citedby.eu said no), refused, unreachable, timeout (the site did not answer the checker), service (no usable answer).
 */
export async function runCheck(target, { apiUrl = DEFAULT_API, lang = 'en', source = 'cli', timeoutMs = 60000, fetchImpl = globalThis.fetch } = {}) {
  const t = cleanTarget(target);
  if (!t) return { ok: false, reason: 'bad_url' };
  const { url, init } = buildRequest({ target: t, lang, source, apiUrl });
  let res;
  let text;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    text = await res.text();
  } catch {
    return { ok: false, reason: 'service' };
  }
  let body = null;
  try { body = JSON.parse(text); } catch { /* not JSON: handled below */ }
  if (res.status === 400 && body?.error === 'bad_url') return { ok: false, reason: 'bad_url' };
  if (res.status === 429) return { ok: false, reason: 'rate_limited' };
  if (res.status === 503) return { ok: false, reason: 'busy' };
  if (res.status !== 200 || !body || body.ok !== true) return { ok: false, reason: 'service' };
  if (body.error) {
    const reason = ['refused', 'unreachable', 'timeout'].includes(body.error) ? body.error : 'service';
    return { ok: false, reason, ...(body.home_status ? { status: body.home_status } : {}) };
  }
  if (!Array.isArray(body.checks)) return { ok: false, reason: 'service' };
  return { ok: true, result: body };
}

/** Counts the way the web page does: only pass, fail and warn are scored; na, info, unknown and any new status are not. */
export function summarize(result) {
  const checks = result.checks || [];
  const n = (s) => checks.filter((c) => c.status === s).length;
  const pass = n('pass');
  const fail = n('fail');
  const warn = n('warn');
  return {
    pass,
    total: checks.filter((c) => COUNTED.has(c.status)).length,
    fail,
    warn,
    info: n('info'),
    skipped: checks.filter((c) => !COUNTED.has(c.status) && c.status !== 'info').length,
    verdict: fail > 0 ? 'fix' : warn > 0 ? 'check' : 'pass',
  };
}

/** 0 clean, 1 something at or above --fail-on, 3 could not measure (never 0: a check that did not run is not a pass). */
export function exitCode(outcome, failOn = 'fail') {
  if (!outcome.ok) return 3;
  if (failOn === 'never') return 0;
  const { verdict } = summarize(outcome.result);
  if (verdict === 'fix') return 1;
  return verdict === 'check' && failOn === 'warn' ? 1 : 0;
}
