import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, runCheck, summarize, exitCode, DEFAULT_API, VERSION } from '../src/check.js';
import { fakeApi, RESULT_MIXED, RESULT_CLEAN } from './_fake-api.js';

test('the request is a JSON POST to citedby.eu/api/check with the address, language and source tag', () => {
  const r = buildRequest({ target: 'example.com', lang: 'de', source: 'cli' });
  assert.equal(r.url, 'https://citedby.eu/api/check');
  assert.equal(DEFAULT_API, 'https://citedby.eu/api/check');
  assert.equal(r.init.method, 'POST');
  assert.equal(r.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(r.init.body), { url: 'example.com', lang: 'de', source: 'cli' });
  assert.match(r.init.headers['user-agent'], new RegExp(`^citedby-check/${VERSION.replace(/\./g, '\\.')} \\(\\+https://github\\.com/resaleiq/citedby-check\\)$`));
});

test('summarize counts like the web page: na, info and unknown are not counted', () => {
  assert.deepEqual(summarize(RESULT_MIXED), { pass: 2, total: 5, fail: 2, warn: 1, info: 1, skipped: 1, verdict: 'fix' });
  assert.deepEqual(summarize(RESULT_CLEAN), { pass: 3, total: 3, fail: 0, warn: 0, info: 1, skipped: 0, verdict: 'pass' });
  assert.equal(summarize({ checks: [{ id: 'raw_text', status: 'warn' }] }).verdict, 'check');
  assert.equal(summarize({ checks: [{ id: 'raw_text', status: 'unknown' }] }).verdict, 'pass');
});

test('exit codes: 0 clean, 1 at or above --fail-on, 3 could not measure', () => {
  const ok = (result) => ({ ok: true, result });
  assert.equal(exitCode(ok(RESULT_CLEAN), 'fail'), 0);
  assert.equal(exitCode(ok(RESULT_MIXED), 'fail'), 1);
  assert.equal(exitCode(ok({ checks: [{ id: 'raw_text', status: 'warn' }] }), 'fail'), 0);
  assert.equal(exitCode(ok({ checks: [{ id: 'raw_text', status: 'warn' }] }), 'warn'), 1);
  assert.equal(exitCode(ok(RESULT_MIXED), 'never'), 0);
  assert.equal(exitCode({ ok: false, reason: 'rate_limited' }, 'never'), 3);
  assert.equal(exitCode({ ok: false, reason: 'refused', status: 403 }, 'fail'), 3);
});

test('a normal answer comes back as the result, untouched', async () => {
  const api = await fakeApi({ status: 200, body: RESULT_MIXED });
  try {
    const o = await runCheck('example.com', { apiUrl: api.url, lang: 'en', source: 'cli' });
    assert.equal(o.ok, true);
    assert.deepEqual(o.result, RESULT_MIXED);
    assert.deepEqual(api.requests[0].json, { url: 'example.com', lang: 'en', source: 'cli' });
    assert.match(api.requests[0].headers['user-agent'], /^citedby-check\//);
  } finally { await api.close(); }
});

test('server answers map to reasons: 400 bad_url, 429, 503, and a site that refused or timed out', async () => {
  const cases = [
    [{ status: 400, body: { ok: false, error: 'bad_url' } }, { ok: false, reason: 'bad_url' }],
    [{ status: 429, body: { ok: false, error: 'rate_limited' } }, { ok: false, reason: 'rate_limited' }],
    [{ status: 503, body: { ok: false, error: 'busy' } }, { ok: false, reason: 'busy' }],
    [{ status: 200, body: { ok: true, site: 'https://x.example', checks: [], reachable: false, error: 'refused', home_status: 403 } }, { ok: false, reason: 'refused', status: 403 }],
    [{ status: 200, body: { ok: true, site: 'https://x.example', checks: [], reachable: false, error: 'unreachable', home_status: 0 } }, { ok: false, reason: 'unreachable' }],
    [{ status: 200, body: { ok: true, site: 'https://x.example', checks: [], reachable: false, error: 'timeout', home_status: 0 } }, { ok: false, reason: 'timeout' }],
    [{ status: 500, body: 'oops' }, { ok: false, reason: 'service' }],
    [{ status: 200, body: 'not json' }, { ok: false, reason: 'service' }],
    [{ status: 200, body: { ok: true, site: 'https://x.example' } }, { ok: false, reason: 'service' }],
  ];
  for (const [reply, want] of cases) {
    const api = await fakeApi(reply);
    try {
      const o = await runCheck('example.com', { apiUrl: api.url });
      assert.equal(o.ok, false, JSON.stringify(reply));
      assert.equal(o.reason, want.reason, JSON.stringify(reply));
      if (want.status !== undefined) assert.equal(o.status, want.status);
    } finally { await api.close(); }
  }
});

test('a dead network and a slow answer are "service", never a pass', async () => {
  const dead = await runCheck('example.com', { apiUrl: 'http://127.0.0.1:9/api/check', timeoutMs: 2000 });
  assert.deepEqual([dead.ok, dead.reason], [false, 'service']);
  const api = await fakeApi({ status: 200, body: RESULT_CLEAN, delayMs: 800 });
  try {
    const slow = await runCheck('example.com', { apiUrl: api.url, timeoutMs: 100 });
    assert.deepEqual([slow.ok, slow.reason], [false, 'service']);
  } finally { await api.close(); }
});

test('addresses that cannot be sent are refused before any request', async () => {
  const api = await fakeApi({ status: 200, body: RESULT_CLEAN });
  try {
    for (const bad of ['', '   ', 'has space.com', 'x'.repeat(301), 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)']) {
      const o = await runCheck(bad, { apiUrl: api.url });
      assert.deepEqual([o.ok, o.reason], [false, 'bad_url'], JSON.stringify(bad));
    }
    assert.equal(api.requests.length, 0);
  } finally { await api.close(); }
});

test('the address goes to the API as typed (trimmed): the server is the one that normalises and refuses private hosts', async () => {
  const api = await fakeApi({ status: 200, body: RESULT_CLEAN });
  try {
    await runCheck('  https://Example.com/shop  ', { apiUrl: api.url });
    assert.equal(api.requests[0].json.url, 'https://Example.com/shop');
  } finally { await api.close(); }
});
