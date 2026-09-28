(() => {
  'use strict';
  const api = String(window.SPOOFREF_API || '').replace(/\/$/, '');
  const form = document.getElementById('request-form');
  const target = document.getElementById('target');
  const referer = document.getElementById('referer');
  const error = document.getElementById('error');
  const output = document.getElementById('output');
  const empty = document.getElementById('empty');
  const send = document.getElementById('send');
  const preview = document.getElementById('preview');
  const source = document.getElementById('source');
  const tabs = [document.getElementById('preview-tab'), document.getElementById('source-tab')];
  const panels = [document.getElementById('preview-panel'), document.getElementById('source-panel')];

  function selectTab(index) {
    tabs.forEach((tab, i) => {
      tab.classList.toggle('active', index === i);
      tab.setAttribute('aria-selected', String(index === i));
      panels[i].hidden = index !== i;
    });
  }
  tabs.forEach((tab, i) => tab.addEventListener('click', () => selectTab(i)));

  document.getElementById('demo').addEventListener('click', () => {
    target.value = `${api}/echo`;
    referer.value = 'https://school.example/lessons/cyber-security';
    error.hidden = true;
    target.focus();
  });

  function makePreview(body, type, finalUrl) {
    if (!type.startsWith('text/html') && !type.startsWith('application/xhtml+xml')) {
      const doc = document.implementation.createHTMLDocument('Response');
      const pre = doc.createElement('pre');
      pre.style.cssText = 'font:14px/1.6 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:15px';
      pre.textContent = body || 'No preview available for this response.';
      doc.body.replaceChildren(pre);
      return '<!doctype html>' + doc.documentElement.outerHTML;
    }
    const doc = new DOMParser().parseFromString(body, 'text/html');
    // A sandbox blocks scripts, forms, popups and top navigation. Remove active
    // elements too, so the teaching preview never acts as the remote website.
    doc.querySelectorAll('script,iframe,frame,frameset,object,embed,form,base,meta[http-equiv],link[rel="preload"],link[rel="modulepreload"]').forEach(el => el.remove());
    const base = doc.createElement('base');
    base.href = finalUrl;
    const noReferrer = doc.createElement('meta');
    noReferrer.name = 'referrer';
    noReferrer.content = 'no-referrer';
    const csp = doc.createElement('meta');
    csp.httpEquiv = 'Content-Security-Policy';
    csp.content = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https: http:; font-src https: http: data:;";
    doc.head.prepend(base, noReferrer, csp);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!api) { error.textContent = 'The request service has not been configured yet.'; error.hidden = false; return; }
    send.disabled = true;
    send.firstChild.textContent = 'Loading… ';
    try {
      const response = await fetch(`${api}/api/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.value.trim(), referer: referer.value.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Service returned ${response.status}.`);
      empty.hidden = true;
      output.hidden = false;
      const badge = document.getElementById('status');
      badge.textContent = `HTTP ${data.status}`;
      badge.classList.toggle('bad', data.status >= 400);
      document.getElementById('content-type').textContent = data.type || 'No content type';
      document.getElementById('sent').textContent = data.refererSent;
      document.getElementById('final').textContent = data.finalUrl;
      document.getElementById('route').textContent = data.hops.map(hop => `${hop.status} ${hop.url}`).join(' → ');
      const notice = document.getElementById('notice');
      notice.hidden = !data.message;
      notice.textContent = data.message || '';
      source.textContent = data.body || '(empty response)';
      preview.srcdoc = makePreview(data.body || '', data.type || '', data.finalUrl);
      selectTab(0);
    } catch (cause) {
      error.textContent = cause instanceof TypeError ? 'Could not contact the request service. Please try again.' : cause.message;
      error.hidden = false;
    } finally {
      send.disabled = false;
      send.firstChild.textContent = 'Send request ';
    }
  });
})();
