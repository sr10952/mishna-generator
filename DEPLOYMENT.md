# Deploying the Mishna Poster Generator — free hosting

The app is **100% static** (one `index.html` + `assets/`). There is no build step, no
server code, and no environment variables: Sefaria API calls happen from the visitor's
browser (Sefaria allows cross-origin requests), so any static host serves the full app
as-is. Pick whichever option below you like — all are on the free tier.

| | Cloudflare Pages (Git) | Cloudflare Pages (Direct Upload) | GitHub Pages |
|---|---|---|---|
| Deploy time | auto on every push | one command | auto on every push |
| Free tier | ✅ | ✅ | ✅ |
| Custom domain + free HTTPS | ✅ | ✅ | ✅ (via GitHub) |
| Recommended | ✅ easiest long-term | ✅ no Git link needed | ✅ 20-second setup |

---

## Option A — Cloudflare Pages, connected to GitHub (recommended)

1. **Push this repo to GitHub** (already done if you're reading this in the repo).
2. Go to <https://dash.cloudflare.com> → sign up / log in (free plan is fine).
3. In the left rail choose **Workers & Pages** → **Create** → **Pages** tab →
   **Connect to Git**.
4. Authorize Cloudflare's GitHub app, then select this repository (`ai-generated`).
5. On the **Set up builds and deployments** screen:
   - **Project name:** `mishna-poster` (becomes `mishna-poster.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
6. Click **Save and Deploy**. First deploy takes ~20 seconds.
7. Done — your site is live at `https://<project-name>.pages.dev`. Every future `git push`
   to `main` redeploys automatically; pull requests get their own preview URL.

**Nothing else to configure** — no environment variables, no redirects, no headers.

### Optional: custom domain (still free)

In your Pages project → **Custom domains** → **Set up a custom domain** → enter your
domain. If the domain's DNS is already on Cloudflare, the `CNAME` record and HTTPS
certificate are configured automatically. Free tier includes unlimited requests,
unlimited bandwidth, and unlimited custom domains.

### Free-tier limits (Pages)

- 500 builds/month (deploys are builds; direct uploads don't count against builds in
  practice, and 500/month is far beyond typical use)
- 20,000 files per deploy, 25 MB max per file (our whole site is ~1.2 MB)
- Unlimited bandwidth, requests, and static requests

---

## Option B — Cloudflare Pages, direct upload (no Git connection)

If you'd rather not link GitHub to Cloudflare, upload the folder directly with Wrangler:

```bash
# from the repo root (the folder containing index.html)
npx wrangler login                       # opens browser once
npx wrangler pages deploy . --project-name=mishna-poster
```

Wrangler uploads the files and prints the live `https://mishna-poster.pages.dev` URL.
Re-run the same command any time to redeploy. Free tier: unlimited uploads.

> Tip: `node_modules/`, `tests/` and `tools/` are only for development. If you want the
> deployed site to be lean, deploy an explicit list instead:
> `npx wrangler pages deploy . --project-name=mishna-poster` is fine as-is (they're
> inert static files), or copy just `index.html` and `assets/` to a temp folder and
> deploy that.

---

## Option C — Cloudflare Workers (alternative)

Pages is the simpler choice, but if you prefer Workers with static assets:

```bash
npm create cloudflare@latest mishna-worker -- --type=static-assets
# copy index.html + assets/ into the generated folder, then:
npx wrangler deploy
```

In `wrangler.toml` keep it minimal:

```toml
name = "mishna-worker"
compatibility_date = "2026-01-01"
assets = { directory = "./" }
```

Free tier: 100,000 requests/day — effectively unlimited for a personal poster tool.

---

## Option D — GitHub Pages

Since the site is plain static files, GitHub Pages can serve it straight from the repo
root. Once enabled (see below), the site goes live at:

> **https://sr10952.github.io/ai-generated/**

**To enable (one-time, ~20 seconds):**

1. Merge this project's pull request into `main` (or use any branch you like).
2. Repo → **Settings** → **Pages** (left sidebar, under "Code and automation").
3. **Build and deployment → Source: Deploy from a branch.**
4. Branch: **`main`**, folder: **`/ (root)`** → **Save**.
5. Wait ~1 minute, then reload the page — the URL above appears at the top.

Every future push to `main` redeploys automatically. Custom domains can be added in the
same settings screen (**Custom domain** field); HTTPS certificates are issued
automatically.

---

## Updating the site

Whichever host you chose, updating is just:

```bash
git add -A && git commit -m "..." && git push
```

- **Cloudflare Pages (Option A)** and **GitHub Pages (Option D)** rebuild automatically.
- **Option B** re-run the `wrangler pages deploy` command.

## Offline / USB use (PWA)

The app is an installable Progressive Web App and works **100% offline** once loaded:

- **Install it** — open the site in Chrome/Edge/Safari and choose *Install* / *Add to Home
  Screen*. A service worker (`sw.js`) precaches the whole app shell, so it keeps working
  with no connection. The bundled text store (`assets/content/`) renders the built-in
  example offline; other tractates need a one-time online fetch (or run
  `node tools/build-content.mjs` to bundle more before deploying).
- **Copy to a USB stick** — copy the entire repo folder. Because ES modules and the
  service worker need `http(s)://`, don't open `index.html` directly; instead run a tiny
  local server from the folder, e.g. `python3 -m http.server 8930` (or `npm start`), then
  open <http://localhost:8930>. Everything else is self-contained — fonts, libraries, and
  the bundled texts all ship in the folder.

## Troubleshooting

- **Blank page on `file://`** — ES modules and the service worker require http(s); use one
  of the hosts above or a local server (`npm start` / `python3 -m http.server`).
- **A code/content change didn't show up** — the service worker serves a cached shell.
  Hard-reload, or bump the cache by running `node tools/build-sw.mjs` (it re-hashes the
  precache list, which invalidates the old cache on next load).
- **"Failed to fetch" when building a poster** — Sefaria's API
  (`https://www.sefaria.org`) must be reachable from the visitor's browser; the host
  itself never calls it, so no server-side config is ever needed.
- **Cloudflare build fails** — make sure Build command is *empty* and output dir is `/`;
  this project has no build step.
