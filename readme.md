# SpoofRef

A small classroom lab for the HTTP `Referer` header. The student interface is published from `docs/` with GitHub Pages. A Node service makes the request because a browser page cannot supply an arbitrary cross-origin Referer value.

## Use

1. Enter a target URL and a Referer page URL, both starting with `http://` or `https://`.
2. Select **Send request** and compare the status, source and read-only preview.
3. Select **Try the header test** to load the built-in echo endpoint. Its JSON response displays the Referer that actually arrived at the service.

The request service fetches only the initial document (and follows up to three HTTP redirects). Images and styles in the sandboxed preview load directly in the student's browser without the forged Referer. Scripts, forms and navigation are disabled. Some sites block automated requests or return pages that cannot be previewed; the source and status still show what the service received.

## Deployment

- Publish `main` / `docs` in the repository's **Settings → Pages**.
- Deploy the repository to a Node host with `npm start`; the service listens on `PORT` (default `3000`).
- Set `window.SPOOFREF_API` in `docs/config.js` to the HTTPS origin of that service. The service allows CORS from `https://southernadd-cmyk.github.io`.

## Service limits

The service rejects private and reserved IP addresses, including after redirects; pins DNS resolution to the checked address; rejects credentialed or non-HTTP URLs; imposes a response size and time limit; and returns text documents only. It does not forward cookies or credentials. Requests are limited per IP address. Do not use it for authentication or for testing sites without permission.
