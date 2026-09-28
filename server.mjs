import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

const PORT = Number(process.env.PORT || 3000);
const MAX_BYTES = 900_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const ALLOWED_ORIGIN = 'https://southernadd-cmyk.github.io';

const blockedV4 = new net.BlockList();
const blockedV6 = new net.BlockList();
for (const [base, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) blockedV4.addSubnet(base, bits, 'ipv4');
for (const [base, bits] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96],
  ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blockedV6.addSubnet(base, bits, 'ipv6');

class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function parseWebUrl(value, label) {
  if (typeof value !== 'string' || value.length > 2048) throw new UserError(`${label} must be a web address under 2048 characters.`);
  let url;
  try { url = new URL(value); } catch { throw new UserError(`Enter a complete ${label.toLowerCase()} starting with https:// or http://.`); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new UserError(`${label} must be a public http:// or https:// address without a username or password.`);
  url.hash = '';
  return url;
}

export function isPublicAddress(address) {
  const family = net.isIP(address);
  return family === 4 ? !blockedV4.check(address, 'ipv4')
    : family === 6 ? !blockedV6.check(address, 'ipv6') : false;
}

export async function resolvePublic(hostname, resolver = dns.lookup) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new UserError('Private or reserved network addresses are blocked.', 422);
    return { address: host, family: net.isIP(host) };
  }
  if (!host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new UserError('The target must have a public hostname.', 422);
  let addresses;
  try { addresses = await resolver(host, { all: true, verbatim: true }); }
  catch { throw new UserError('Could not resolve the target hostname.', 422); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new UserError('The target resolves to a private or reserved address.', 422);
  return addresses[0];
}

async function requestOnce(url, referer) {
  const pinned = await resolvePublic(url.hostname);
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method: 'GET',
      agent: false,
      lookup: (_host, _options, cb) => cb(null, pinned.address, pinned.family),
      headers: {
        'Referer': referer,
        'Accept': 'text/html, text/plain, application/json;q=0.9, */*;q=0.1',
        'Accept-Encoding': 'identity',
        'User-Agent': 'SpoofRef-Classroom/1.0',
      },
    }, (response) => {
      // Only read HTML, JSON and plain text. Never return a third-party binary file.
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        resolve({ status, location });
        return;
      }
      const type = String(response.headers['content-type'] || '').toLowerCase();
      if (!/^(text\/(html|plain)|application\/(json|xhtml\+xml))\b/.test(type)) {
        response.resume();
        resolve({ status, type, body: '', message: 'The target returned a non-previewable content type.' });
        return;
      }
      const encoding = String(response.headers['content-encoding'] || 'identity').toLowerCase();
      let stream = response;
      if (encoding === 'gzip') stream = response.pipe(createGunzip());
      else if (encoding === 'deflate') stream = response.pipe(createInflate());
      else if (encoding === 'br') stream = response.pipe(createBrotliDecompress());
      else if (encoding !== 'identity') {
        response.resume();
        resolve({ status, type, body: '', message: 'The response uses an unsupported compression format.' });
        return;
      }
      (async () => {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of stream) {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            req.destroy();
            throw new UserError('The response is too large for the classroom preview (900 KB limit).', 413);
          }
          chunks.push(chunk);
        }
        return { status, type, body: Buffer.concat(chunks).toString('utf8') };
      })().then(resolve, reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new UserError('The target took too long to respond.', 504)));
    req.on('error', reject);
    req.end();
  });
}

export async function fetchTarget(target, referer, requester = requestOnce) {
  let url = parseWebUrl(target, 'Target URL');
  const ref = parseWebUrl(referer, 'Referer URL').href;
  const hops = [];
  for (let n = 0; n <= MAX_REDIRECTS; n++) {
    const result = await requester(url, ref);
    hops.push({ url: url.href, status: result.status });
    if (!result.location) return { ...result, finalUrl: url.href, refererSent: ref, hops };
    if (n === MAX_REDIRECTS) throw new UserError('The target redirected too many times.', 422);
    url = parseWebUrl(new URL(result.location, url).href, 'Redirect URL');
  }
}

const windows = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const current = windows.get(ip);
  if (!current || now - current.start > 60_000) {
    windows.set(ip, { start: now, count: 1 });
  } else if (++current.count > 180) {
    throw new UserError('Please wait a minute before trying again.', 429);
  }
  if (windows.size > 1000) {
    for (const [key, item] of windows) if (now - item.start > 60_000) windows.delete(key);
  }
}

function send(res, status, data, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin === ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
  });
  res.end(JSON.stringify(data));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (req.url === '/health') return send(res, 200, { ok: true }, origin);
    if (req.url === '/echo') {
      // Useful for checking the actual header outside the UI, with curl or a link.
      return send(res, 200, { refererReceived: req.headers.referer || null }, origin);
    }
    if (req.url === '/api/probe' && req.method === 'OPTIONS') {
      if (origin !== ALLOWED_ORIGIN) return send(res, 403, { error: 'This origin is not allowed.' }, origin);
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin',
      });
      return res.end();
    }
    if (req.url !== '/api/probe' || req.method !== 'POST') return send(res, 404, { error: 'Not found.' }, origin);
    if (origin !== ALLOWED_ORIGIN && origin !== undefined) return send(res, 403, { error: 'This origin is not allowed.' }, origin);
    try {
      rateLimit(req.socket.remoteAddress || 'unknown');
      let size = 0;
      const parts = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 6000) throw new UserError('Request is too large.', 413);
        parts.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); }
      catch { throw new UserError('Invalid request.'); }
      const result = await fetchTarget(input.target, input.referer);
      send(res, 200, result, origin);
    } catch (error) {
      send(res, error.status || 502, { error: error.status ? error.message : 'Could not load the target page.' }, origin);
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createServer().listen(PORT, '0.0.0.0', () => console.log(`SpoofRef service listening on ${PORT}`));
}
