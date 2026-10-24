import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderText, renderMarkdown, annotations, auditUrl, reasonText } from '../src/render.js';
import { RESULT_MIXED, RESULT_CLEAN } from './_fake-api.js';

const plain = { color: false, width: 80 };
const mixed = { ok: true, result: RESULT_MIXED };
const clean = { ok: true, result: RESULT_CLEAN };

test('findings: one block per check, the fix in the words of the web check, a summary and the link back', () => {
  const raw = renderText(mixed, { ...plain, target: 'shop.example' });
  assert.match(raw, /^AI-search readiness check for shop\.example\n/);
  const t = raw.replace(/\s+/g, ' ');                      // messages are wrapped to the terminal width
  assert.match(t, /FIX AI crawlers allowed in robots\.txt/);
  assert.match(t, /robots\.txt blocks: GPTBot, PerplexityBot\. Fix: remove those Disallow rules/);
  assert.match(t, /CHECK Text in the page HTML/);
  assert.match(t, /Only 80 words of text are in the raw HTML\. Fix:/);
  assert.match(t, /FIX Organization data \(JSON-LD\)/);
  assert.match(t, /OK Product data \(JSON-LD\)/);
  assert.match(t, /OPTIONAL llms\.txt/);
  assert.match(t, /NOT CHECKED Availability in product data/);
  assert.match(t, /No product page was found from the home page, so product data was not checked\./);
  assert.match(t, /2 of 5 checks passed\. 2 to fix, 1 to check\./);
  assert.match(t, /This is a technical check\. It does not tell you whether an AI assistant will name your site\./);
  assert.match(t, /Product checks ran on shop\.example\/products\/mug\./);
});

test('the link back carries the address and the four UTM fields, and the plan-limit wording, never "every page"', () => {
  const u = auditUrl('https://shop.example', { channel: 'cli' });
  assert.equal(u, 'https://citedby.eu/?url=shop.example&utm_source=cli&utm_medium=referral&utm_campaign=citedbycheck_202610&utm_content=terminal_01');
  assert.equal(auditUrl('https://shop.example/', { channel: 'action' }), 'https://citedby.eu/?url=shop.example&utm_source=github_action&utm_medium=referral&utm_campaign=citedbycheck_202610&utm_content=summary_01');
  assert.equal(auditUrl('shop.example', { channel: 'cli', source: 'none' }), 'https://citedby.eu/?url=shop.example');
  const t = renderText(mixed, plain);
  assert.ok(t.includes(auditUrl('https://shop.example', { channel: 'cli' })));
  assert.match(t, /up to your plan's page limit/);
  assert.doesNotMatch(t, /every page/i);
});

test('a clean site gets a clean report: no "to fix", no sales line', () => {
  const t = renderText(clean, { ...plain, target: 'good.example' });
  assert.match(t, /3 of 3 checks passed\./);
  assert.doesNotMatch(t, /to fix|to check/);
  assert.doesNotMatch(t, /citedby\.eu\/\?url=/);
});

test('one check reads "1 of 1 check passed"', () => {
  const t = renderText({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'crawlers', status: 'pass', robots_found: false }] } }, plain);
  assert.match(t, /1 of 1 check passed\./);
  assert.match(t, /No robots\.txt found, so nothing is blocked\./);
});

test('--quiet is one line', () => {
  assert.equal(renderText(mixed, { ...plain, quiet: true }).trim(), 'shop.example: 2 of 5 checks passed. 2 to fix, 1 to check.');
  assert.equal(renderText(clean, { ...plain, quiet: true }).trim(), 'good.example: 3 of 3 checks passed.');
});

test('colors only when asked, and never inside the text', () => {
  const on = renderText(mixed, { color: true, width: 80 });
  assert.match(on, /\u001b\[31mFIX/);
  assert.match(on, /\u001b\[32mOK/);
  assert.doesNotMatch(renderText(mixed, plain), /\u001b/);
});

test('lines are wrapped to the width with the message under its title', () => {
  const t = renderText(mixed, { ...plain, width: 60 });
  for (const line of t.split('\n')) assert.ok(line.length <= 60 || /https?:\/\//.test(line), `too long: ${line}`);
});

test('a redirect is said, because another site was checked', () => {
  const t = renderText({ ok: true, result: { ...RESULT_CLEAN, redirected_to: 'https://www.good.example' } }, plain);
  assert.match(t, /Your address redirects to www\.good\.example; that site was checked\./);
});

test('an id or status the CLI does not know yet is shown, not dropped or crashed on', () => {
  const t = renderText({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'new_check', status: 'pass' }, { id: 'newer_check', status: 'weird' }] } }, plain);
  assert.match(t, /new_check/);
  assert.match(t, /newer_check/);
  assert.match(t, /Status: weird\./);
});

test('every reason that stops a measurement says so and is not a pass', () => {
  const reasons = ['bad_url', 'rate_limited', 'busy', 'refused', 'unreachable', 'timeout', 'service'];
  for (const reason of reasons) {
    const t = renderText({ ok: false, reason, status: 403 }, { ...plain, target: 'x.example' });
    assert.match(t, /^Not measured: /, reason);
    assert.match(t, /Nothing was measured, so this is not a pass\./, reason);
    assert.doesNotMatch(t, /checks passed/, reason);
  }
  assert.match(reasonText({ ok: false, reason: 'refused', status: 403 }), /refused the checker's request \(HTTP 403\)/);
  assert.match(reasonText({ ok: false, reason: 'refused' }), /refused the checker's request\. /);
  assert.match(reasonText({ ok: false, reason: 'bad_url' }), /localhost/);
  assert.match(reasonText({ ok: false, reason: 'rate_limited' }), /few free checks an hour/);
});

test('wording: AI-search readiness, never AI-powered', () => {
  for (const o of [mixed, clean, { ok: false, reason: 'service' }]) {
    const t = renderText(o, plain) + renderMarkdown(o, { channel: 'action', target: 'x.example' });
    assert.doesNotMatch(t, /AI-powered|powered by AI|AI engine|our AI/i);
  }
});

test('markdown summary: a table row per check, pipes and newlines escaped, link back', () => {
  const md = renderMarkdown({ ok: true, result: { ...RESULT_MIXED, checks: [{ id: 'org_schema', status: 'pass', found: ['A|B'] }, ...RESULT_MIXED.checks.slice(0, 2)] } }, { channel: 'action' });
  assert.match(md, /^## AI-search readiness: shop\.example/);
  assert.match(md, /\| Status \| Check \| Detail \|/);
  assert.match(md, /\| OK \| Organization data \(JSON-LD\) \| Organization or business data found \(A\\\|B\)\. \|/);
  assert.match(md, /\| Fix \| AI crawlers allowed in robots\.txt \|/);
  assert.match(md, /utm_source=github_action/);
  assert.ok(!/\n\|[^\n]*\n[^|\n]/.test(md.split('\n\n')[2] || ''), 'table has no broken rows');
});

test('annotations: an error per Fix, a warning per Check, a warning when nothing was measured; values are escaped', () => {
  const a = annotations(mixed, 'fail');
  assert.equal(a.filter((l) => l.startsWith('::error ')).length, 2);
  assert.equal(a.filter((l) => l.startsWith('::warning ')).length, 1);
  assert.match(a[0], /^::error title=CitedBy%3A AI crawlers allowed in robots\.txt::robots\.txt blocks: GPTBot, PerplexityBot\./);
  const n = annotations({ ok: false, reason: 'rate_limited' }, 'fail');
  assert.equal(n.length, 1);
  assert.match(n[0], /^::warning title=CitedBy%3A not measured::/);
  const esc = annotations({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'x', status: 'fail' }] } }, 'fail')[0];
  assert.doesNotMatch(esc.slice(2), /\n/);
  assert.equal(annotations({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'raw_text', status: 'warn', words: 1 }] } }, 'never').filter((l) => l.startsWith('::error')).length, 0);
});

test('annotations: with --fail-on warn a Check is raised as an error because it fails the step', () => {
  const a = annotations({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'raw_text', status: 'warn', words: 60 }] } }, 'warn');
  assert.match(a[0], /^::error /);
});

const NO_SHOP = {
  site: 'https://blog.example',
  checks: [
    { id: 'crawlers', status: 'pass', robots_found: true, checked: ['GPTBot', 'Bingbot'] },
    { id: 'product_schema', status: 'na' },
    { id: 'product_price', status: 'na' },
    { id: 'product_availability', status: 'na' },
    { id: 'product_gtin', status: 'na' },
    { id: 'llms_txt', status: 'info' },
  ],
};

test('checks that were not run for the same reason are one block, not four', () => {
  const t = renderText({ ok: true, result: NO_SHOP }, plain);
  assert.equal((t.match(/NOT CHECKED/g) || []).length, 1);
  assert.equal((t.match(/No product page was found/g) || []).length, 1);
  const flat = t.replace(/\s+/g, ' ');
  assert.match(flat, /NOT CHECKED Product data \(JSON-LD\), Price in product data, Availability in product data, GTIN or barcode in product data No product page was found/);
  assert.match(flat, /1 of 1 check passed\./);
});

test('the markdown summary groups them the same way', () => {
  const md = renderMarkdown({ ok: true, result: NO_SHOP }, { channel: 'action' });
  assert.equal((md.match(/\| Not checked \|/g) || []).length, 1);
  assert.match(md, /\| Not checked \| Product data \(JSON-LD\), Price in product data, Availability in product data, GTIN or barcode in product data \| No product page was found/);
});

test('different reasons stay apart: an unreadable page is not a missing product page', () => {
  const t = renderText({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'crawlers', status: 'pass' }, { id: 'raw_text', status: 'unknown' }, { id: 'org_schema', status: 'unknown' }, { id: 'product_schema', status: 'na' }] } }, plain).replace(/\s+/g, ' ');
  assert.equal((t.match(/NOT CHECKED/g) || []).length, 2);
  assert.match(t, /NOT CHECKED Text in the page HTML, Organization data \(JSON-LD\) The page could not be read/);
});

test('annotations: with --fail-on never nothing is an error, because nothing fails the step', () => {
  const a = annotations(mixed, 'never');
  assert.equal(a.filter((l) => l.startsWith('::error')).length, 0);
  assert.equal(a.filter((l) => l.startsWith('::warning')).length, 3);
});

test('a robots.txt that answered 5xx is a Fix with its own words, not "No robots.txt found" (RFC 9309 2.3.1.4)', () => {
  const FIVE = ['OAI-SearchBot', 'GPTBot', 'PerplexityBot', 'Google-Extended', 'Bingbot'];
  for (const status of [500, 503]) {
    const t = renderText({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'crawlers', status: 'fail', blocked: FIVE, checked: FIVE, robots_found: false, robots_status: status }] } }, plain).replace(/\s+/g, ' ');
    assert.match(t, /FIX AI crawlers allowed in robots\.txt/);
    assert.match(t, new RegExp(`robots\\.txt answered HTTP ${status}\\. Crawlers that follow RFC 9309 treat that as Disallow: / for the whole site\\.`));
    assert.doesNotMatch(t, /No robots\.txt found/);
  }
});

test('a robots.txt we could not load is Not checked, never OK', () => {
  const t = renderText({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'crawlers', status: 'unknown', blocked: [], checked: [], robots_found: false, robots_status: 0 }, { id: 'raw_text', status: 'pass', words: 300 }] } }, plain).replace(/\s+/g, ' ');
  assert.match(t, /NOT CHECKED AI crawlers allowed in robots\.txt We could not load robots\.txt/);
  assert.doesNotMatch(t, /No robots\.txt found|OK +AI crawlers/);
});

test('404 still reads "No robots.txt found": no file means no rules', () => {
  const t = renderText({ ok: true, result: { site: 'https://a.example', checks: [{ id: 'crawlers', status: 'pass', robots_found: false, robots_status: 404 }] } }, plain);
  assert.match(t, /No robots\.txt found, so nothing is blocked\./);
});
