import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { main } from '../src/cli.js';
import { VERSION } from '../src/check.js';
import { fakeApi, RESULT_MIXED, RESULT_CLEAN } from './_fake-api.js';

const bin = new URL('../bin/citedby-check.js', import.meta.url).pathname;

async function run(argv, { reply, env = {}, tty = false } = {}) {
  const api = reply ? await fakeApi(reply) : null;
  let stdout = '';
  let stderr = '';
  try {
    const code = await main(argv, {
      env: { ...(api ? { CITEDBY_API_URL: api.url } : {}), ...env },
      stdout: { write: (s) => { stdout += s; }, isTTY: tty, columns: 80 },
      stderr: { write: (s) => { stderr += s; } },
    });
    return { code, stdout, stderr, requests: api?.requests };
  } finally { await api?.close(); }
}

test('--help prints the help and exits 0; --version prints the version', async () => {
  const h = await run(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /^citedby-check: AI-search readiness check/);
  const v = await run(['--version']);
  assert.deepEqual([v.code, v.stdout.trim()], [0, VERSION]);
});

test('wrong use exits 2 with the reason on stderr and nothing on stdout', async () => {
  for (const argv of [[], ['a.com', 'b.com'], ['a.com', '--fail-on', 'x']]) {
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^citedby-check: .+\nRun citedby-check --help\.\n$/s);
  }
});

test('a clean site exits 0 and says so', async () => {
  const r = await run(['good.example'], { reply: { status: 200, body: RESULT_CLEAN } });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /3 of 3 checks passed\./);
  assert.equal(r.stderr, '');
});

test('a site with a Fix exits 1; --fail-on never makes it 0; --fail-on warn catches a Check', async () => {
  assert.equal((await run(['shop.example'], { reply: { status: 200, body: RESULT_MIXED } })).code, 1);
  assert.equal((await run(['shop.example', '--fail-on', 'never'], { reply: { status: 200, body: RESULT_MIXED } })).code, 0);
  const warnOnly = { ...RESULT_CLEAN, checks: [{ id: 'raw_text', status: 'warn', words: 90 }] };
  assert.equal((await run(['a.example'], { reply: { status: 200, body: warnOnly } })).code, 0);
  assert.equal((await run(['a.example', '--fail-on', 'warn'], { reply: { status: 200, body: warnOnly } })).code, 1);
});

test('--json prints the answer as JSON, same exit codes', async () => {
  const r = await run(['shop.example', '--json'], { reply: { status: 200, body: RESULT_MIXED } });
  assert.equal(r.code, 1);
  assert.deepEqual(JSON.parse(r.stdout), RESULT_MIXED);
});

test('rate limited: exit 3, the message on stderr, nothing on stdout; with --json the reason is on stdout', async () => {
  const r = await run(['shop.example'], { reply: { status: 429, body: { ok: false, error: 'rate_limited' } } });
  assert.equal(r.code, 3);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^Not measured: citedby\.eu allows a few free checks an hour/);
  const j = await run(['shop.example', '--json'], { reply: { status: 429, body: { ok: false, error: 'rate_limited' } } });
  assert.equal(j.code, 3);
  assert.deepEqual(JSON.parse(j.stdout), { ok: false, reason: 'rate_limited' });
  assert.match(j.stderr, /Not measured/);
});

test('a site that refused the checker is exit 3, not a pass, with the status code', async () => {
  const r = await run(['shop.example'], { reply: { status: 200, body: { ok: true, site: 'https://shop.example', checks: [], reachable: false, error: 'refused', home_status: 403 } } });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /refused the checker's request \(HTTP 403\)/);
});

test('--lang, --source and CITEDBY_API_URL reach the request; the default tag is cli', async () => {
  const r = await run(['shop.example', '--lang', 'fr', '--source', 'none'], { reply: { status: 200, body: RESULT_CLEAN } });
  assert.deepEqual(r.requests[0].json, { url: 'shop.example', lang: 'fr', source: 'none' });
  const d = await run(['shop.example'], { reply: { status: 200, body: RESULT_CLEAN } });
  assert.deepEqual(d.requests[0].json, { url: 'shop.example', lang: 'en', source: 'cli' });
});

test('colors only on a terminal, and never with NO_COLOR or --no-color', async () => {
  const reply = { status: 200, body: RESULT_MIXED };
  assert.doesNotMatch((await run(['shop.example'], { reply })).stdout, /\u001b/);
  assert.match((await run(['shop.example'], { reply, tty: true })).stdout, /\u001b\[31m/);
  assert.doesNotMatch((await run(['shop.example'], { reply, tty: true, env: { NO_COLOR: '1' } })).stdout, /\u001b/);
  assert.doesNotMatch((await run(['shop.example', '--no-color'], { reply, tty: true })).stdout, /\u001b/);
});

test('--quiet prints one line', async () => {
  const r = await run(['shop.example', '-q'], { reply: { status: 200, body: RESULT_MIXED } });
  assert.equal(r.stdout, 'shop.example: 2 of 5 checks passed. 2 to fix, 1 to check.\n');
  assert.equal(r.code, 1);
});

test('the bin file runs under node, sets the exit code and needs no install', () => {
  const v = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.deepEqual([v.status, v.stdout.trim()], [0, VERSION]);
  const bad = spawnSync(process.execPath, [bin], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Give the address of the site to check/);
});
