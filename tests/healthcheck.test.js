'use strict';

/**
 * @file tests/healthcheck.test.js
 * @description Tests for the healthcheck module.
 * @author idirdev
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { check, checkMultiple, retryCheck, formatReport, summary, HealthChecker } = require('../src/index.js');

function createTestServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

test('check returns healthy=true for 200 response', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  try {
    const result = await check(`http://127.0.0.1:${port}/`);
    assert.equal(result.healthy, true);
    assert.equal(result.status, 200);
    assert.equal(result.error, null);
    assert.ok(result.time >= 0);
  } finally {
    server.close();
  }
});

test('check returns healthy=false for 500 response', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(500);
    res.end('error');
  });
  try {
    const result = await check(`http://127.0.0.1:${port}/`);
    assert.equal(result.healthy, false);
    assert.equal(result.status, 500);
  } finally {
    server.close();
  }
});

test('check accepts 500 when listed in expectedStatus', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(500);
    res.end('ok');
  });
  try {
    const result = await check(`http://127.0.0.1:${port}/`, { expectedStatus: [500] });
    assert.equal(result.healthy, true);
  } finally {
    server.close();
  }
});

test('check bodyMatch works correctly', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200);
    res.end('status:operational');
  });
  try {
    const ok = await check(`http://127.0.0.1:${port}/`, { bodyMatch: /operational/ });
    assert.equal(ok.healthy, true);

    const fail = await check(`http://127.0.0.1:${port}/`, { bodyMatch: /degraded/ });
    assert.equal(fail.healthy, false);
  } finally {
    server.close();
  }
});

test('check returns healthy=false on connection refused', async () => {
  const result = await check('http://127.0.0.1:1');
  assert.equal(result.healthy, false);
  assert.ok(result.error);
});

test('checkMultiple returns results for all urls', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  try {
    const results = await checkMultiple([
      `http://127.0.0.1:${port}/a`,
      `http://127.0.0.1:${port}/b`,
    ]);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.healthy));
  } finally {
    server.close();
  }
});

test('summary counts healthy and unhealthy correctly', async () => {
  const results = [
    { healthy: true, time: 10 },
    { healthy: false, time: 20 },
    { healthy: true, time: 30 },
  ];
  const s = summary(results);
  assert.equal(s.total, 3);
  assert.equal(s.healthy, 2);
  assert.equal(s.unhealthy, 1);
  assert.equal(s.avgTime, 20);
});

test('HealthChecker addEndpoint and checkAll work', async () => {
  const { server, port } = await createTestServer((req, res) => {
    res.writeHead(200);
    res.end('running');
  });
  try {
    const hc = new HealthChecker({ timeout: 3000 });
    hc.addEndpoint(`http://127.0.0.1:${port}/`);
    const results = await hc.checkAll();
    assert.equal(results.length, 1);
    assert.equal(results[0].healthy, true);
    const hist = hc.getHistory(`http://127.0.0.1:${port}/`);
    assert.equal(hist.length, 1);
    assert.ok(hist[0].timestamp);
  } finally {
    server.close();
  }
});

test('HealthChecker removeEndpoint works', async () => {
  const hc = new HealthChecker();
  hc.addEndpoint('http://example.com/');
  hc.removeEndpoint('http://example.com/');
  const results = await hc.checkAll();
  assert.equal(results.length, 0);
});

test('formatReport returns string with check results', async () => {
  const results = [
    { url: 'http://example.com', status: 200, time: 50, healthy: true, error: null },
    { url: 'http://fail.com', status: null, time: 5000, healthy: false, error: 'timeout' },
  ];
  const report = formatReport(results);
  assert.equal(typeof report, 'string');
  assert.ok(report.includes('http://example.com'));
  assert.ok(report.includes('http://fail.com'));
});
