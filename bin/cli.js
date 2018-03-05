#!/usr/bin/env node
'use strict';

/**
 * @file bin/cli.js
 * @description CLI entry point for healthcheck.
 * @author idirdev
 */

const { checkMultiple, retryCheck, formatReport, summary } = require('../src/index.js');

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log([
    'Usage: healthcheck <url...> [options]',
    '',
    'Options:',
    '  --timeout <ms>        Request timeout in ms (default: 5000)',
    '  --status <codes>      Comma-separated acceptable status codes (default: 200)',
    '  --body-match <regex>  Regex the response body must match',
    '  --json                Output raw JSON result',
    '  --retries <n>         Retry count on failure (default: 0)',
    '  -h, --help            Show this help',
  ].join('\n'));
  process.exit(0);
}

const urls = [];
let timeout = 5000;
let expectedStatus = [200];
let bodyMatch;
let jsonOutput = false;
let retries = 0;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--timeout' && args[i + 1]) {
    timeout = parseInt(args[++i], 10);
  } else if (a === '--status' && args[i + 1]) {
    expectedStatus = args[++i].split(',').map(Number);
  } else if (a === '--body-match' && args[i + 1]) {
    bodyMatch = new RegExp(args[++i]);
  } else if (a === '--json') {
    jsonOutput = true;
  } else if (a === '--retries' && args[i + 1]) {
    retries = parseInt(args[++i], 10);
  } else if (!a.startsWith('-')) {
    urls.push(a);
  }
}

if (urls.length === 0) {
  console.error('Error: at least one URL is required.');
  process.exit(1);
}

const opts = { timeout, expectedStatus, bodyMatch };

const run = retries > 0
  ? Promise.all(urls.map((u) => retryCheck(u, opts, retries)))
  : checkMultiple(urls, opts);

run
  .then((results) => {
    if (jsonOutput) {
      console.log(JSON.stringify({ results, summary: summary(results) }, null, 2));
    } else {
      console.log(formatReport(results));
      const s = summary(results);
      console.log(`Summary: ${s.healthy}/${s.total} healthy  avg ${s.avgTime}ms`);
    }
    const allHealthy = results.every((r) => r.healthy);
    process.exit(allHealthy ? 0 : 1);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
