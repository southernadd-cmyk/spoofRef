// natas Referer proxy — teaching tool
// Makes the request server-side, where the Referer header can be set freely.
// LOCKED to the natas wargame hosts so it can't be used as a general open proxy.

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- host allowlist -------------------------------------------------------
// Only natas.labs.overthewire.org and its subdomains are reachable through
// this proxy. Anything else is refused. This keeps it a teaching tool and
// stops it becoming an open relay.
const ALLOW_SUFFIX = '.natas.labs.overthewire.org';
function hostAllowed(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    return h === 'natas.labs.overthewire.org' || h.endsWith(ALLOW_SUFFIX);
  } catch (e) {
    return false;
  }
}

app.post('/fetch', async (req, res) => {
  const { target, referer, username, password } = req.body || {};

  // The response can contain lab passwords; keep intermediaries from caching it.
  res.set('Cache-Control', 'no-store');

  if (!target || !hostAllowed(target)) {
    return res.status(400).json({
      error: 'Target must be a natas.labs.overthewire.org URL. This proxy is locked to the natas wargame on purpose.'
    });
  }

  const headers = {};
  if (referer) headers['Referer'] = String(referer);
  if (username || password) {
    const token = Buffer.from(`${username || ''}:${password || ''}`).toString('base64');
    headers['Authorization'] = 'Basic ' + token;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(target, { headers, redirect: 'manual', signal: controller.signal });
    let body = await r.text();
    if (body.length > 200000) body = body.slice(0, 200000) + '\n... [truncated]';
    res.json({
      status: r.status,
      statusText: r.statusText,
      sentReferer: headers['Referer'] || null,
      body
    });
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed: ' + (err.message || String(err)) });
  } finally {
    clearTimeout(timer);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('natas Referer proxy listening on ' + PORT));
