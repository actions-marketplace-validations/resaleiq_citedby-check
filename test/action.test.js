import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runAction } from '../src/action.js';
import { fakeApi, RESULT_MIXED, RESULT_CLEAN } from './_fake-api.js';

async function act(inputs, reply, { files = true } = {}) {
  const api = reply ? await fakeApi(reply) : null;
  const dir = mkdtempSync(join(tmpdir(), 'cbaction-'));
  const out = join(dir, 'output');
  const summary = join(dir, 'summary');
  writeFileSync(out, '');
  writeFileSync(summary, '');
  const env = { ...(api ? { CITEDBY_API_URL: api.url } : {}), ...(files ? { GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary } : {}) };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  let stdout = '';
  try {
    const code = await runAction({ env, stdout: { write: (s) => { stdout += s; } } });
    return { code, stdout, outputs: Object.fromEntries(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))), summary: readFileSync(summary, 'utf8'), requests: api?.requests };
  } finally { await api?.close(); }
}

test('a clean site: step passes, outputs set, report in the log and the job summary', async () => {
  const r = await act({ url: 'https://good.example' }, { status: 200, body: RESULT_CLEAN });
  assert.equal(r.code, 0);
  assert.deepEqual(r.outputs, { result: 'pass', passed: '3', total: '3', 'fix-count': '0', 'check-count': '0' });
  assert.match(r.stdout, /3 of 3 checks passed\./);
  assert.doesNotMatch(r.stdout, /\u001b/);
  assert.match(r.summary, /^## AI-search readiness: good\.example/);
  assert.match(r.summary, /\| Status \| Check \| Detail \|/);
});

test('a Fix fails the step and shows as an error annotation; a Check is a warning', async () => {
  const r = await act({ url: 'https://shop.example' }, { status: 200, body: RESULT_MIXED });
  assert.equal(r.code, 1);
  assert.equal(r.outputs.result, 'fix');
  assert.equal(r.outputs['fix-count'], '2');
  assert.equal(r.outputs['check-count'], '1');
  assert.equal((r.stdout.match(/^::error /gm) || []).length, 2);
  assert.equal((r.stdout.match(/^::warning /gm) || []).length, 1);
  assert.match(r.stdout, /utm_source=github_action/);
});

test('fail-on never reports without failing, and raises no error annotation', async () => {
  const r = await act({ url: 'https://shop.example', 'fail-on': 'never' }, { status: 200, body: RESULT_MIXED });
  assert.equal(r.code, 0);
  assert.equal(r.outputs.result, 'fix');
  assert.doesNotMatch(r.stdout, /^::error /m);
});

test('fail-on warn fails on a Check', async () => {
  const warnOnly = { ...RESULT_CLEAN, checks: [{ id: 'raw_text', status: 'warn', words: 90 }] };
  assert.equal((await act({ url: 'a.example' }, { status: 200, body: warnOnly })).code, 0);
  const r = await act({ url: 'a.example', 'fail-on': 'warn' }, { status: 200, body: warnOnly });
  assert.equal(r.code, 1);
  assert.equal(r.outputs.result, 'check');
});

test('not measured is a warning and a green step, so a rate limit never breaks a deploy; fail-on-error turns it red', async () => {
  const reply = { status: 429, body: { ok: false, error: 'rate_limited' } };
  const r = await act({ url: 'a.example' }, reply);
  assert.equal(r.code, 0);
  assert.equal(r.outputs.result, 'not-measured');
  assert.match(r.stdout, /^::warning title=CitedBy%3A not measured::/m);
  assert.match(r.summary, /Not measured/);
  const strict = await act({ url: 'a.example', 'fail-on-error': 'true' }, reply);
  assert.equal(strict.code, 1);
  assert.equal(strict.outputs.result, 'not-measured');
});

test('the tag sent is action by default, and the input can change it', async () => {
  const a = await act({ url: 'a.example' }, { status: 200, body: RESULT_CLEAN });
  assert.deepEqual(a.requests[0].json, { url: 'a.example', lang: 'en', source: 'action' });
  const b = await act({ url: 'a.example', source: 'ci', lang: 'de' }, { status: 200, body: RESULT_CLEAN });
  assert.deepEqual(b.requests[0].json, { url: 'a.example', lang: 'de', source: 'ci' });
});

test('wrong inputs fail the step with an error that names the input', async () => {
  for (const [inputs, re] of [[{}, /Input url is required/], [{ url: 'a.example', 'fail-on': 'x' }, /fail-on/], [{ url: 'a.example', lang: 'xx' }, /lang/], [{ url: 'a.example', source: 'Bad Tag' }, /source/], [{ url: 'a.example', 'fail-on-error': 'maybe' }, /fail-on-error/]]) {
    const r = await act(inputs, null);
    assert.equal(r.code, 1, JSON.stringify(inputs));
    assert.match(r.stdout, /^::error::/m);
    assert.match(r.stdout, re);
  }
});

test('outside GitHub (no GITHUB_OUTPUT or summary file) it still runs and prints', async () => {
  const r = await act({ url: 'https://good.example' }, { status: 200, body: RESULT_CLEAN }, { files: false });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /3 of 3 checks passed\./);
});

test('GitHub starts it as `node src/action.js`: the inputs come from INPUT_* and the exit code is the step result', async () => {
  const api = await fakeApi({ status: 200, body: RESULT_MIXED });
  const entry = new URL('../src/action.js', import.meta.url).pathname;
  try {
    const r = await promisify(execFile)(process.execPath, [entry], { env: { PATH: process.env.PATH, CITEDBY_API_URL: api.url, 'INPUT_URL': 'https://shop.example', 'INPUT_FAIL-ON': 'fail' } }).then(
      (ok) => ({ code: 0, stdout: ok.stdout }),
      (e) => ({ code: e.code, stdout: e.stdout }),
    );
    assert.equal(r.code, 1);
    assert.match(r.stdout, /^::error title=CitedBy%3A AI crawlers allowed in robots\.txt::/m);
    assert.equal(api.requests[0].json.source, 'action');
  } finally { await api.close(); }
});
