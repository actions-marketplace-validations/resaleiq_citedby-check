import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, UsageError, HELP } from '../src/args.js';

test('a bare address is the target; defaults are fail-on fail, lang en, source cli', () => {
  const a = parseArgs(['example.com']);
  assert.equal(a.target, 'example.com');
  assert.equal(a.failOn, 'fail');
  assert.equal(a.lang, 'en');
  assert.equal(a.source, 'cli');
  assert.equal(a.json, false);
  assert.equal(a.quiet, false);
  assert.equal(a.help, false);
});

test('flags can come before or after the address, with = or a space', () => {
  const a = parseArgs(['--fail-on=warn', 'https://example.com/shop', '--lang', 'fr', '--json', '-q', '--no-color']);
  assert.deepEqual(
    [a.target, a.failOn, a.lang, a.json, a.quiet, a.color],
    ['https://example.com/shop', 'warn', 'fr', true, true, false],
  );
});

test('--help and --version need no address', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['-v']).version, true);
});

test('no address is a usage error that names the fix', () => {
  assert.throws(() => parseArgs([]), (e) => e instanceof UsageError && /address/i.test(e.message));
});

test('two addresses are refused in v0.1 (the free check allows a few runs an hour)', () => {
  assert.throws(() => parseArgs(['a.com', 'b.com']), (e) => e instanceof UsageError && /one address/i.test(e.message));
});

test('unknown flag, bad --fail-on and bad --lang are usage errors', () => {
  assert.throws(() => parseArgs(['example.com', '--nope']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--fail-on', 'sometimes']), (e) => /fail, warn or never/.test(e.message));
  assert.throws(() => parseArgs(['example.com', '--lang', 'xx']), (e) => /en, fr, de, es or nl/.test(e.message));
  assert.throws(() => parseArgs(['example.com', '--fail-on']), UsageError);
});

test('--source sets the tag; only [a-z0-9_-] up to 20 characters', () => {
  assert.equal(parseArgs(['example.com', '--source', 'none']).source, 'none');
  assert.throws(() => parseArgs(['example.com', '--source', 'Has Space']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--source', 'x'.repeat(21)]), UsageError);
});

test('--api-url must be http(s)', () => {
  assert.equal(parseArgs(['example.com', '--api-url', 'http://127.0.0.1:9/api/check']).apiUrl, 'http://127.0.0.1:9/api/check');
  assert.throws(() => parseArgs(['example.com', '--api-url', 'file:///etc/passwd']), UsageError);
});

test('-- ends flags, so an address can never be read as one', () => {
  assert.equal(parseArgs(['--', '-weird.example']).target, '-weird.example');
});

test('help text states what is sent and where, and never says AI-powered', () => {
  assert.match(HELP, /citedby\.eu/);
  assert.match(HELP, /AI-search readiness/);
  assert.doesNotMatch(HELP, /AI-powered|powered by AI/i);
  for (const flag of ['--json', '--fail-on', '--lang', '--quiet', '--source']) assert.ok(HELP.includes(flag), flag);
});
