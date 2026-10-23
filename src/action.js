// The GitHub Action: reads the inputs GitHub passes as INPUT_* variables, runs the same check as the CLI,
// and reports through the log, annotations, the job summary and step outputs. No dependencies.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCheck, exitCode, summarize, LANGS } from './check.js';
import { renderText, renderMarkdown, annotations, escData } from './render.js';

const FAIL_ON = ['fail', 'warn', 'never'];

export async function runAction({ env = process.env, stdout = process.stdout, fetchImpl } = {}) {
  const input = (name, fallback = '') => (env[`INPUT_${name.toUpperCase()}`] ?? '').trim() || fallback;
  const say = (line) => stdout.write(`${line}\n`);
  const bad = (message) => { say(`::error::${escData(message)}`); return 1; };

  const url = input('url');
  const failOn = input('fail-on', 'fail');
  const lang = input('lang', 'en');
  const source = input('source', 'action');
  const failOnError = input('fail-on-error', 'false');
  if (!url) return bad('Input url is required: the address of the site to check, for example https://example.com');
  if (!FAIL_ON.includes(failOn)) return bad('Input fail-on takes fail, warn or never.');
  if (!LANGS.includes(lang)) return bad('Input lang takes en, fr, de, es or nl.');
  if (!/^[a-z0-9_-]{1,20}$/.test(source)) return bad('Input source takes up to 20 characters of a-z, 0-9, _ and -.');
  if (!['true', 'false'].includes(failOnError)) return bad('Input fail-on-error takes true or false.');

  const outcome = await runCheck(url, { apiUrl: env.CITEDBY_API_URL || undefined, lang, source, fetchImpl });

  stdout.write(renderText(outcome, { color: false, width: 100, target: url, channel: 'action', source }));
  for (const line of annotations(outcome, failOn)) say(line);

  const s = outcome.ok ? summarize(outcome.result) : null;
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${renderMarkdown(outcome, { channel: 'action', source, target: url })}\n`);
  if (env.GITHUB_OUTPUT) {
    const outputs = { result: s ? s.verdict : 'not-measured', passed: s ? s.pass : 0, total: s ? s.total : 0, 'fix-count': s ? s.fail : 0, 'check-count': s ? s.warn : 0 };
    appendFileSync(env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''));
  }

  if (!outcome.ok) return failOnError === 'true' ? 1 : 0; // a check that could not run warns; it breaks a deploy only when asked to
  return exitCode(outcome, failOn);
}

// Run directly by GitHub (runs.main), not when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAction();
}
