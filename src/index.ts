/**
 * CLI entry point — parses flags and starts the headless session.
 *
 * Usage:
 *   remy [--api-key <key>] [--base-url <url>] [--model <id>]
 *        [--lsp-url <url>] [--log-level <level>]
 *
 * Headless is the only mode. Stdout carries the newline-delimited JSON
 * protocol and stderr carries logs; see headless/index.ts for the protocol
 * itself. There is no interactive surface — the editor is the front end.
 */

import { HeadlessSession } from './headless/index.js';
import { initLoggerHeadless, type LogLevel } from './logger.js';

/**
 * Simple positional parsing, no framework needed.
 *
 * Unrecognized arguments are ignored on purpose, which is what lets
 * `--headless` stay spawnable after it stopped meaning anything.
 * mindstudio-sandbox invokes `remy --headless` from a devbox image versioned
 * independently of this package, so a fatal unknown-flag check here would put
 * the two in release lockstep for no gain.
 */
const args = process.argv.slice(2);
const flags: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-key' && args[i + 1]) {
    flags.apiKey = args[++i];
  } else if (args[i] === '--base-url' && args[i + 1]) {
    flags.baseUrl = args[++i];
  } else if (args[i] === '--model' && args[i + 1]) {
    flags.model = args[++i];
  } else if (args[i] === '--lsp-url' && args[i + 1]) {
    flags.lspUrl = args[++i];
  } else if (args[i] === '--log-level' && args[i + 1]) {
    flags.logLevel = args[++i];
  }
}

initLoggerHeadless((flags.logLevel as LogLevel) || undefined);

new HeadlessSession({
  apiKey: flags.apiKey,
  baseUrl: flags.baseUrl,
  model: flags.model,
  lspUrl: flags.lspUrl,
})
  .start()
  .catch((err: any) => {
    console.error(err.message);
    process.exit(1);
  });
