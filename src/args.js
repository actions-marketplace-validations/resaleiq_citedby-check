import { DEFAULT_API, LANGS } from './check.js';

export class UsageError extends Error {}

export const HELP = `citedby-check: AI-search readiness check for a public website

Usage: citedby-check <address> [options]

Asks citedby.eu to load the address from outside (plain HTTP, no JavaScript) and
reports, with the fix for each problem: whether robots.txt lets AI-search crawlers
in, whether the page text is in the HTML they receive, Organization and Product
data, and llms.txt. Free, no account, no API key.

Options:
  --fail-on <level>   exit 1 when a check reaches this level: fail (default), warn or never
  --lang <code>       language your site is asked for: en (default), fr, de, es or nl
  --json              print the raw result as JSON
  -q, --quiet         print only the summary line
  --no-color          no colors (NO_COLOR is honored too)
  --source <tag>      tag sent with the check so citedby.eu can count runs (default: cli)
  --api-url <url>     another endpoint for the check (default: ${DEFAULT_API})
  -h, --help          show this help
  -v, --version       show the version

Exit codes: 0 nothing at or above --fail-on, 1 something to fix, 2 wrong use, 3 the check
could not be measured (rate limit, your site refused or did not answer, no answer from citedby.eu).

Sent to citedby.eu: the address, the language code and the source tag. Nothing else.
Private and local addresses (localhost, 10.x, 192.168.x) cannot be checked from outside.
https://github.com/resaleiq/citedby-check
`;

const FAIL_ON = ['fail', 'warn', 'never'];

function apiUrlOk(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Throws UsageError on anything it cannot read. env is only read for CITEDBY_API_URL. */
export function parseArgs(argv, env = {}) {
  const out = { target: null, help: false, version: false, json: false, quiet: false, color: undefined, failOn: 'fail', lang: 'en', source: 'cli', apiUrl: env.CITEDBY_API_URL || DEFAULT_API };
  const positional = [];
  const args = [...argv];
  const value = (flag, inline) => {
    if (inline !== undefined) return inline;
    const v = args.shift();
    if (v === undefined || (v.startsWith('-') && v !== '-')) throw new UsageError(`${flag} needs a value.`);
    return v;
  };
  while (args.length) {
    const a = args.shift();
    if (a === '--') { positional.push(...args.splice(0)); break; }
    if (!a.startsWith('-') || a === '-') { positional.push(a); continue; }
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    switch (flag) {
      case '-h': case '--help': out.help = true; break;
      case '-v': case '--version': out.version = true; break;
      case '--json': out.json = true; break;
      case '-q': case '--quiet': out.quiet = true; break;
      case '--no-color': out.color = false; break;
      case '--fail-on': {
        const v = value(flag, inline);
        if (!FAIL_ON.includes(v)) throw new UsageError('--fail-on takes fail, warn or never.');
        out.failOn = v;
        break;
      }
      case '--lang': {
        const v = value(flag, inline);
        if (!LANGS.includes(v)) throw new UsageError('--lang takes en, fr, de, es or nl.');
        out.lang = v;
        break;
      }
      case '--source': {
        const v = value(flag, inline);
        if (!/^[a-z0-9_-]{1,20}$/.test(v)) throw new UsageError('--source takes up to 20 characters of a-z, 0-9, _ and -.');
        out.source = v;
        break;
      }
      case '--api-url': {
        const v = value(flag, inline);
        if (!apiUrlOk(v)) throw new UsageError('--api-url takes an http or https address.');
        out.apiUrl = v;
        break;
      }
      default:
        throw new UsageError(`Unknown option ${flag}. Run citedby-check --help.`);
    }
  }
  if (out.help || out.version) return out;
  if (positional.length === 0) throw new UsageError('Give the address of the site to check, for example: citedby-check example.com');
  if (positional.length > 1) throw new UsageError('One address at a time: the free check allows a few runs an hour.');
  if (!apiUrlOk(out.apiUrl)) throw new UsageError('CITEDBY_API_URL must be an http or https address.');
  out.target = positional[0];
  return out;
}
