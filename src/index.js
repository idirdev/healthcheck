'use strict';

/**
 * @module healthcheck
 * @description Monitor HTTP endpoint health with configurable checks and history.
 * @author idirdev
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Perform a health check against a single URL.
 *
 * @param {string} url - Endpoint URL to check.
 * @param {object} [opts={}] - Check options.
 * @param {number} [opts.timeout=5000] - Request timeout in ms.
 * @param {number[]} [opts.expectedStatus=[200]] - Acceptable HTTP status codes.
 * @param {RegExp|string} [opts.bodyMatch] - Pattern the response body must match.
 * @param {object} [opts.headers={}] - Additional request headers.
 * @param {string} [opts.method='GET'] - HTTP method to use.
 * @returns {Promise<CheckResult>} Health check result.
 */
async function check(url, opts = {}) {
  const {
    timeout = 5000,
    expectedStatus = [200],
    bodyMatch,
    headers = {},
    method = 'GET',
  } = opts;

  const start = Date.now();

  try {
    const res = await _fetch(url, { method, headers, timeout });
    const time = Date.now() - start;

    const statusOk = expectedStatus.includes(res.statusCode);
    let bodyOk = true;
    if (bodyMatch) {
      const re = bodyMatch instanceof RegExp ? bodyMatch : new RegExp(bodyMatch);
      bodyOk = re.test(res.body);
    }

    const healthy = statusOk && bodyOk;
    return { url, status: res.statusCode, time, healthy, error: null };
  } catch (err) {
    return { url, status: null, time: Date.now() - start, healthy: false, error: err.message };
  }
}

/**
 * Perform health checks on multiple URLs in parallel.
 *
 * @param {string[]} urls - List of endpoint URLs to check.
 * @param {object} [opts={}] - Options passed to each check().
 * @returns {Promise<CheckResult[]>} Array of health check results.
 */
async function checkMultiple(urls, opts = {}) {
  return Promise.all(urls.map((url) => check(url, opts)));
}

/**
 * Perform a health check with automatic retries on failure.
 *
 * @param {string} url - Endpoint URL to check.
 * @param {object} [opts={}] - Options passed to check().
 * @param {number} [retries=3] - Number of retry attempts.
 * @returns {Promise<CheckResult>} Final health check result.
 */
async function retryCheck(url, opts = {}, retries = 3) {
  let last;
  for (let i = 0; i <= retries; i++) {
    last = await check(url, opts);
    if (last.healthy) return last;
    if (i < retries) {
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  return last;
}

/**
 * Format an array of check results as an ASCII report.
 *
 * @param {CheckResult[]} results - Results from check() or checkMultiple().
 * @returns {string} ASCII formatted report.
 */
function formatReport(results) {
  const lines = ['\nHealth Check Report', '='.repeat(50)];
  for (const r of results) {
    const icon = r.healthy ? '✓' : '✗';
    const status = r.status !== null ? `HTTP ${r.status}` : 'ERROR';
    lines.push(`${icon} ${r.url}`);
    lines.push(`  Status: ${status}  Time: ${r.time}ms  Healthy: ${r.healthy}`);
    if (r.error) lines.push(`  Error: ${r.error}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Compute a summary over an array of check results.
 *
 * @param {CheckResult[]} results - Results to summarise.
 * @returns {object} Summary with total, healthy, unhealthy counts and avg time.
 */
function summary(results) {
  const total = results.length;
  const healthy = results.filter((r) => r.healthy).length;
  const unhealthy = total - healthy;
  const avgTime = total > 0
    ? Math.round(results.reduce((s, r) => s + r.time, 0) / total)
    : 0;
  return { total, healthy, unhealthy, avgTime };
}

/**
 * Stateful health checker that manages endpoints and persists history.
 */
class HealthChecker {
  /**
   * @param {object} [opts={}] - Default options for all checks.
   */
  constructor(opts = {}) {
    /** @type {Map<string, object>} */
    this._endpoints = new Map();
    /** @type {Map<string, CheckResult[]>} */
    this._history = new Map();
    this._defaultOpts = opts;
  }

  /**
   * Register an endpoint to monitor.
   *
   * @param {string} url - Endpoint URL.
   * @param {object} [opts={}] - Per-endpoint check options.
   * @returns {this}
   */
  addEndpoint(url, opts = {}) {
    this._endpoints.set(url, opts);
    if (!this._history.has(url)) this._history.set(url, []);
    return this;
  }

  /**
   * Remove a registered endpoint.
   *
   * @param {string} url - Endpoint URL to remove.
   * @returns {this}
   */
  removeEndpoint(url) {
    this._endpoints.delete(url);
    return this;
  }

  /**
   * Run health checks against all registered endpoints.
   *
   * @returns {Promise<CheckResult[]>} Results for all endpoints.
   */
  async checkAll() {
    const entries = [...this._endpoints.entries()];
    const results = await Promise.all(
      entries.map(([url, endpointOpts]) =>
        check(url, { ...this._defaultOpts, ...endpointOpts })
      )
    );

    for (const result of results) {
      const hist = this._history.get(result.url) || [];
      hist.push({ ...result, timestamp: Date.now() });
      if (hist.length > 100) hist.shift();
      this._history.set(result.url, hist);
    }

    return results;
  }

  /**
   * Retrieve stored history for a given endpoint.
   *
   * @param {string} url - Endpoint URL.
   * @returns {object[]} Array of past check results with timestamps.
   */
  getHistory(url) {
    return this._history.get(url) || [];
  }
}

/**
 * Internal HTTP/HTTPS fetch helper.
 *
 * @param {string} rawUrl - URL to request.
 * @param {object} opts - Request options.
 * @returns {Promise<{statusCode: number, body: string}>}
 * @private
 */
function _fetch(rawUrl, opts) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method,
      headers: opts.headers || {},
    };

    const req = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString() })
      );
    });

    req.setTimeout(opts.timeout, () =>
      req.destroy(new Error(`Timeout after ${opts.timeout}ms`))
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * @typedef {object} CheckResult
 * @property {string} url - Endpoint URL that was checked.
 * @property {number|null} status - HTTP status code, or null on network error.
 * @property {number} time - Elapsed time in ms.
 * @property {boolean} healthy - Whether the endpoint is considered healthy.
 * @property {string|null} error - Error message if the check failed, else null.
 */

module.exports = { check, checkMultiple, retryCheck, formatReport, summary, HealthChecker };
