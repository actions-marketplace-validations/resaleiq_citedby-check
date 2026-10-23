import { parseArgs, UsageError, HELP } from './args.js';
import { runCheck, exitCode, VERSION } from './check.js';
import { renderText, reasonText } from './render.js';

/** Runs the CLI and returns the exit code. Streams and env are injected so tests never touch the real ones. */
export async function main(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr, fetchImpl } = {}) {
  let args;
  try {
    args = parseArgs(argv, env);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    stderr.write(`citedby-check: ${e.message}\nRun citedby-check --help.\n`);
    return 2;
  }
  if (args.help) { stdout.write(HELP); return 0; }
  if (args.version) { stdout.write(`${VERSION}\n`); return 0; }

  const outcome = await runCheck(args.target, { apiUrl: args.apiUrl, lang: args.lang, source: args.source, fetchImpl });
  const code = exitCode(outcome, args.failOn);

  if (args.json) {
    stdout.write(`${JSON.stringify(outcome.ok ? outcome.result : { ok: false, reason: outcome.reason, ...(outcome.status ? { status: outcome.status } : {}) }, null, 2)}\n`);
    if (!outcome.ok) stderr.write(`Not measured: ${reasonText(outcome)}\n`);
    return code;
  }
  const color = args.color !== false && !env.NO_COLOR && (env.FORCE_COLOR ? env.FORCE_COLOR !== '0' : Boolean(stdout.isTTY));
  const text = renderText(outcome, { color, quiet: args.quiet, width: Math.min(stdout.columns || 80, 100), target: args.target, channel: 'cli', source: args.source });
  (outcome.ok ? stdout : stderr).write(text);
  return code;
}
