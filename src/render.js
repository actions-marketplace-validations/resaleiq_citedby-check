// Turns an outcome from runCheck into text for a terminal, markdown for a job summary and GitHub annotations.
import { summarize } from './check.js';
import { titleOf, wordOf, messageOf } from './labels.js';

const SITE = 'https://citedby.eu/';
const CAMPAIGN = 'citedbycheck_202610';
const NOTE = 'This is a technical check. It does not tell you whether an AI assistant will name your site.';

const bareHost = (site) => String(site || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');

/** The full-audit link. UTM fields follow citedby UTM.md: source = where it was shown, medium referral, campaign lane + month, content = the asset. */
export function auditUrl(site, { channel = 'cli', source = 'cli' } = {}) {
  const base = `${SITE}?url=${encodeURIComponent(bareHost(site))}`;
  if (source === 'none') return base;
  const [utmSource, content] = channel === 'action' ? ['github_action', 'summary_01'] : ['cli', 'terminal_01'];
  return `${base}&utm_source=${utmSource}&utm_medium=referral&utm_campaign=${CAMPAIGN}&utm_content=${content}`;
}

const REASONS = {
  bad_url: 'That does not look like a public website address. Use something like example.com. Private and local addresses (localhost, 10.x, 192.168.x) cannot be checked from outside.',
  rate_limited: 'citedby.eu allows a few free checks an hour per site and per connection, and this one is used up. Try again in an hour.',
  busy: 'citedby.eu is busy right now. Try again in a minute.',
  unreachable: 'The checker could not reach that address. Check it and try again.',
  timeout: 'Your site took too long to answer. Slow answers also hurt crawlers.',
  service: 'citedby.eu did not give a usable answer. Try again in a minute.',
};

export function reasonText(outcome) {
  if (outcome.reason === 'refused') {
    const status = outcome.status ? ` (HTTP ${outcome.status})` : '';
    return `Your site refused the checker's request${status}. That can happen when protection software treats every automated visitor as a threat, and it may be refusing AI crawlers too. We cannot tell from here.`;
  }
  return REASONS[outcome.reason] || REASONS.service;
}

function wrap(text, width, indent) {
  const room = Math.max(20, width - indent);
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > room) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join(`\n${' '.repeat(indent)}`);
}

const paint = (on, code, s) => (on ? `\u001b[${code}m${s}\u001b[0m` : s);
const COLORS = { pass: 32, fail: 31, warn: 33, info: 2, na: 2, unknown: 2 };

const plural = (n, one, many) => (n === 1 ? one : many);

/** Checks that were not run (na, unknown) for the same reason are one entry, so a site with no shop does not get four copies of one sentence. */
function entries(checks) {
  const out = [];
  for (const c of checks) {
    const message = messageOf(c);
    const group = c.status === 'na' || c.status === 'unknown' ? out.find((e) => e.group && e.status === c.status && e.message === message) : null;
    if (group) group.titles.push(titleOf(c));
    else out.push({ status: c.status, titles: [titleOf(c)], message, group: c.status === 'na' || c.status === 'unknown' });
  }
  return out;
}

function summaryLine(s) {
  const bits = [];
  if (s.fail) bits.push(`${s.fail} to fix`);
  if (s.warn) bits.push(`${s.warn} to check`);
  return `${s.pass} of ${s.total} ${plural(s.total, 'check', 'checks')} passed.${bits.length ? ` ${bits.join(', ')}.` : ''}`;
}

export function renderText(outcome, { color = false, quiet = false, width = 80, target = '', channel = 'cli', source = 'cli' } = {}) {
  if (!outcome.ok) {
    const head = `Not measured: ${reasonText(outcome)}`;
    return quiet ? `${head}\n` : `${wrap(head, width, 0)}\nNothing was measured, so this is not a pass.\n`;
  }
  const { result } = outcome;
  const site = bareHost(result.site) || target;
  const s = summarize(result);
  if (quiet) return `${site}: ${summaryLine(s)}\n`;
  const out = [`AI-search readiness check for ${site}`, wrap('citedby.eu loaded the site from outside: plain HTTP, no JavaScript.', width, 0)];
  if (result.redirected_to) out.push(wrap(`Your address redirects to ${bareHost(result.redirected_to)}; that site was checked.`, width, 0));
  out.push('');
  const col = 14;
  for (const e of entries(result.checks)) {
    const word = wordOf(e.status).toUpperCase();
    out.push(`  ${paint(color, COLORS[e.status] || 0, word)}${' '.repeat(Math.max(1, col - 2 - word.length))}${wrap(e.titles.join(', '), width, col)}`);
    out.push(`${' '.repeat(col)}${wrap(e.message, width, col)}`);
  }
  if (result.product_page) out.push('', wrap(`Product checks ran on ${bareHost(result.product_page)}.`, width, 0));
  out.push('', summaryLine(s), wrap(NOTE, width, 0));
  if (s.fail + s.warn > 0) {
    out.push('', wrap("The full audit crawls your site up to your plan's page limit and gives the exact fix for each problem:", width, 0), auditUrl(site, { channel, source }));
  }
  return `${out.join('\n')}\n`;
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function renderMarkdown(outcome, { channel = 'action', source = 'action', target = '' } = {}) {
  if (!outcome.ok) return `## AI-search readiness: ${target}\n\n**Not measured.** ${reasonText(outcome)}\n\nNothing was measured, so this is not a pass.\n`;
  const { result } = outcome;
  const site = bareHost(result.site) || target;
  const s = summarize(result);
  const rows = entries(result.checks).map((e) => `| ${cell(wordOf(e.status))} | ${cell(e.titles.join(', '))} | ${cell(e.message)} |`);
  const out = [`## AI-search readiness: ${site}`, '', `**${summaryLine(s)}**`, '', '| Status | Check | Detail |', '| --- | --- | --- |', ...rows, '', `_Checked from outside by citedby.eu: plain HTTP, no JavaScript. ${NOTE}_`];
  if (s.fail + s.warn > 0) out.push('', `The full audit crawls your site up to your plan's page limit and gives the exact fix for each problem: ${auditUrl(site, { channel, source })}`);
  return `${out.join('\n')}\n`;
}

export const escData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

const FAILS = { fail: ['fail'], warn: ['fail', 'warn'], never: [] };

/** GitHub workflow commands. An error is what fails the step under the chosen fail-on; everything else that needs attention is a warning. */
export function annotations(outcome, failOn = 'fail') {
  if (!outcome.ok) return [`::warning title=${escProp('CitedBy: not measured')}::${escData(reasonText(outcome))}`];
  const lines = [];
  for (const c of outcome.result.checks) {
    if (c.status !== 'fail' && c.status !== 'warn') continue;
    const level = (FAILS[failOn] || FAILS.fail).includes(c.status) ? 'error' : 'warning';
    lines.push(`::${level} title=${escProp(`CitedBy: ${titleOf(c)}`)}::${escData(messageOf(c))}`);
  }
  return lines;
}
