/**
 * CLI entry point — parses flags and dispatches to TUI or headless mode.
 *
 * Usage:
 *   remy [--api-key <key>] [--base-url <url>] [--model <id>] [--headless]
 *
 * Ctrl+C exits cleanly via Ink's exitOnCtrlC option.
 */

import React from 'react';
import { render } from 'ink';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { App } from './tui/App.js';
import { resolveConfig } from './config.js';
import {
  initLoggerHeadless,
  initLoggerInteractive,
  type LogLevel,
} from './logger.js';

// Parse CLI flags (simple positional parsing, no framework needed)
const args = process.argv.slice(2);
const flags: Record<string, string> = {};
let headless = false;
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
  } else if (args[i] === '--headless') {
    headless = true;
  }
}

function printDebugInfo(config: { apiKey: string; baseUrl: string }) {
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, '..', 'package.json'),
      'utf-8',
    ),
  );
  const keyPreview = config.apiKey
    ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`
    : '(none)';

  console.log('');
  console.log('remy debug info');
  console.log('─'.repeat(40));
  console.log(`  version:    ${pkg.version}`);
  console.log(`  node:       ${process.version}`);
  console.log(`  platform:   ${os.platform()} ${os.arch()}`);
  console.log(`  os:         ${os.type()} ${os.release()}`);
  console.log(`  cwd:        ${process.cwd()}`);
  console.log(`  bin:        ${process.argv[1]}`);
  console.log(`  model:      ${flags.model || '(default)'}`);
  console.log(`  base url:   ${config.baseUrl}`);
  console.log(`  api key:    ${keyPreview}`);
  console.log(
    `  key source: ${flags.apiKey ? 'cli flag' : process.env.MINDSTUDIO_API_KEY ? 'env var' : 'config file'}`,
  );
  console.log('─'.repeat(40));
  console.log('');
}

const logLevel = (flags.logLevel as LogLevel) || undefined;

if (headless) {
  initLoggerHeadless(logLevel);
  const { startHeadless } = await import('./headless.js');
  startHeadless({
    apiKey: flags.apiKey,
    baseUrl: flags.baseUrl,
    model: flags.model,
    lspUrl: flags.lspUrl,
  }).catch((err: any) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  initLoggerInteractive(logLevel);
  try {
    const config = resolveConfig({
      apiKey: flags.apiKey,
      baseUrl: flags.baseUrl,
    });

    printDebugInfo(config);

    const { waitUntilExit } = render(
      <App
        apiConfig={{ baseUrl: config.baseUrl, apiKey: config.apiKey }}
        model={flags.model}
      />,
      { exitOnCtrlC: true },
    );

    await waitUntilExit();
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
