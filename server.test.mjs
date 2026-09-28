import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, fetchTarget, isPublicAddress, parseWebUrl, resolvePublic } from './server.mjs';

test('validates URLs and strips fragments from the transmitted Referer', async () => {
  assert.throws(() => parseWebUrl('file:///etc/passwd', 'Target URL'));
  assert.throws(() => parseWebUrl('https://user:pass@example.com', 'Target URL'));
  const calls = [];
  const result = await fetchTarget('https://example.org/page', 'https://example.net/source?a=1#secret', async (url, referer) => {
    calls.push([url.href, referer]);
    return { status: 200, type: 'text/plain', body: 'ok' };
  });
  assert.deepEqual(calls, [['https://example.org/page', 'https://example.net/source?a=1']]);
  assert.equal(result.refererSent, 'https://example.net/source?a=1');
});

test('blocks private and reserved destinations, including DNS results and redirects', async () => {
  for (const address of ['127.0.0.1', '10.2.1.2', '169.254.169.254', '192.168.0.10', '::1', 'fc00::1', '::ffff:127.0.0.1'])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  await assert.rejects(resolvePublic('localhost'));
  await assert.rejects(resolvePublic('private.example', async () => [{ address: '127.0.0.1', family: 4 }]));
  await assert.rejects(resolvePublic('mixed.example', async () => [
    { address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 },
  ]));
  await assert.rejects(fetchTarget('https://example.org', 'https://example.net', async (url) => {
    if (url.hostname === '127.0.0.1') await resolvePublic(url.hostname);
    return { status: 302, location: 'http://127.0.0.1/private' };
  }), /Private or reserved/);
});

test('echo endpoint shows the actual Referer header and disallows other browser origins', async () => {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const echo = await fetch(`${base}/echo`, { headers: { Referer: 'https://lesson.example/test' } });
    assert.deepEqual(await echo.json(), { refererReceived: 'https://lesson.example/test' });
    const blocked = await fetch(`${base}/api/probe`, {
      method: 'POST', headers: { Origin: 'https://other.example' },
    });
    assert.equal(blocked.status, 403);
    const preflight = await fetch(`${base}/api/probe`, {
      method: 'OPTIONS', headers: { Origin: 'https://southernadd-cmyk.github.io', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://southernadd-cmyk.github.io');
  } finally { server.close(); }
});
