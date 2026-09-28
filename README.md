# Natas Referer proxy

A small teaching tool for the OverTheWire Natas 4 Referer challenge. The browser sends a POST to this Node server; the server requests Natas with the entered `Referer` header and returns the response. The target is editable within `natas.labs.overthewire.org` and its subdomains. The Referer value is editable. Redirects are not followed, so requests cannot bounce to another host.

**Live server tool:** https://spoof-ref-production.up.railway.app/

The repository's root `index.html` is an earlier browser-only Referer lesson and remains on GitHub Pages. The `docs/` folder is an older frontend draft that expects a different request service and is not used by this app. Railway serves `public/index.html` through `server.js`.

## Run locally

Requires Node 18 or later:

```bash
npm install
npm start
```

Open http://localhost:3000. `GET /health` returns a simple health response.

## Deploy to Railway

Connect this repository on Railway and deploy the `main` branch. The app has a `start` script, listens on Railway's `PORT`, and needs no environment variables. Generate a public Railway domain for students.

## Classroom use

1. Enter the Natas 4 username and password earned from the previous level.
2. Leave the target at `http://natas4.natas.labs.overthewire.org/` and the Referer at `http://natas5.natas.labs.overthewire.org/`, or edit them for an appropriate Natas exercise.
3. Send the request and inspect the returned status and response. The page highlights the next password if it finds one.

An HTTP 401 means Natas rejected the target level's username/password before it could check the Referer. For the default target, enter `natas4` and the password obtained by completing natas3. A successful login with the wrong Referer may return HTTP 200 without revealing the next password.

Only use Natas lab credentials. Credentials submitted in the form pass through this Railway service and are sent to the Natas host; the Natas URL shown here uses plain HTTP. The response is marked `Cache-Control: no-store`.

The proxy rejects targets outside Natas. It cannot load arbitrary websites and is not a general browser or open proxy.
