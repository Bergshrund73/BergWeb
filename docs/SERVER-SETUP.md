# Hosting: GitHub Pages

Canonical URL: `https://bergshrund73.github.io/BergWeb/`

## Publish

1. Build the release APK in BergHanziTrainer, then create the GitHub Release **`v<versionName>`** in this repository
   and attach the APK as **`berghanzitrainer-<versionName>.apk`** (exactly this name: the page links to
   `https://github.com/Bergshrund73/BergWeb/releases/download/v<version>/berghanzitrainer-<version>.apk`).
   Do not mark it as a pre-release: the download counter skips drafts and pre-releases.
   With the GitHub CLI: `gh release create v0.4.0 berghanzitrainer-0.4.0.apk --title "0.4.0" --notes "…"`.
2. Rebuild: `cd tools && npm install && node build.mjs --with-apk` (without `--with-apk` the download buttons are a stub;
   add `--apk <file>` when the uploaded file is not the current `app/build/outputs/apk/release/app-release.apk`)
   (expects the BergHanziTrainer checkout next to this repository, or pass `--app <path>`; reads `versionName` from
   `app/build.gradle.kts`, takes the APK size and SHA-256 from the APK, regenerates images and HTML).
   The SHA-256 on the page must match the file attached to the release.
3. Commit `docs/` and push to `main` — only after the release exists, or the download button gives a 404.
4. Once: repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**,
   and tick **Enforce HTTPS**. The repository must be public on a free GitHub plan.

`docs/.nojekyll` turns Jekyll off so files are served as-is.

## What GitHub Pages does and does not allow

| Requirement | Status on GitHub Pages |
|---|---|
| HTTPS + HTTP→HTTPS redirect | Provided by GitHub (Enforce HTTPS). |
| Brotli/gzip | gzip is served by GitHub's CDN; Brotli is not configurable — not claimed. |
| `Cache-Control` | Fixed by GitHub (`max-age=600` for every file). `immutable` for fingerprinted assets is **not possible** here; filenames are still fingerprinted so a move to a configurable host needs no HTML change. |
| Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, HSTS) | Custom headers are **not configurable**. The page ships a `<meta>` Content-Security-Policy (inline style authorised by a SHA-256 hash, scripts only from the site itself) and a `<meta name="referrer">`. `frame-ancestors` cannot be set via `<meta>`. Put a CDN (e.g. Cloudflare) in front if real headers are needed. |
| MIME types | `.html`, `.avif`, `.webp`, `.jpg`, `.png`, `.txt`, `.xml`, `.js`, `.json` are served with correct types by GitHub. Verify after deploy: `curl -sI <url>` per file type. |
| File size | Single files up to 100 MB. The APK (~55 MB) is not stored in the repository: it is a GitHub Release asset (up to 2 GB per file), so new versions do not grow the git history. |

## robots.txt and sitemap

A project site lives under `/BergWeb/`, while crawlers only read `robots.txt` at the host root
(`https://bergshrund73.github.io/robots.txt`), which belongs to a separate `Bergshrund73.github.io` repository.
`docs/robots.txt` is shipped for completeness but is **not** authoritative. Submit
`https://bergshrund73.github.io/BergWeb/sitemap.xml` in Google Search Console and Yandex Webmaster
instead (verify ownership with an HTML file or meta tag).

## Donation form

The donation block is an explicitly labelled stub (`<fieldset disabled>`, no submission target).
Before enabling it, pick a payment service (e.g. YooMoney Quickpay form or a CloudTips/Boosty link),
record where payments land and who owns that data here, add the service to the CSP `form-action`,
and test a real payment end to end.

## Site settings: `tools/site.config.json`

| Key | What it turns on |
|---|---|
| `githubRepo` | Repository whose Releases hold the APK and supply download counts. |
| `goatcounter` | GoatCounter site code (`<code>.goatcounter.com`). Empty: no visit counting, no visit counter in the footer. |
| `web3formsKey` | Web3Forms access key. Empty: the feedback form is a disabled stub. |

Rebuild after changing them. `--config <file>` builds with another file (e.g. test values for a local build).

### Visit counter (GoatCounter)

1. Sign up at goatcounter.com and pick the site code; put it into `goatcounter`.
2. In GoatCounter **Settings**, tick **Allow adding visitor counts on your website** — the footer reads the public
   `/counter/TOTAL.json`; without this setting the request fails and the counter stays hidden.
3. Counting is a 1×1 image request from `assets/site.*.js` (plus a `<noscript>` image), sent only when the page is
   opened at the canonical URL, so local builds do not add visits. No cookies; GoatCounter keeps no IP addresses, only
   the path, referrer, browser and screen size.

### Download counter

`assets/site.*.js` reads `https://api.github.com/repos/<githubRepo>/releases` (no token; GitHub allows 60 requests per
hour per visitor IP, the page caches the answer for 10 minutes in `sessionStorage`). It sums the `.apk` asset
`download_count` of release `v<version>` and of the release published before it, and shows both with the days each
was current and the per-day rate. Counting starts when the APK moved to Releases: downloads of 0.3.0 from
`docs/download/` before that are not included. If the API fails, the block stays hidden.

### Feedback form (Web3Forms)

1. Get an access key at web3forms.com for the email address that should receive messages; put it into `web3formsKey`.
   The key is public by design (it is in the page) and only allows sending to that address.
2. Fields: topic, message, app version, optional email. A hidden `botcheck` checkbox is Web3Forms' honeypot.
   An email is sent only with the consent checkbox ticked (it appears once an email is typed).
3. With JavaScript the form is sent with `fetch` and shows the result in place; without it, it is a plain POST and
   Web3Forms shows its own confirmation page.
4. Free plan: 250 submissions a month. Messages are processed by Web3Forms (outside Russia) and land in your inbox.

## Third-party dependencies

No third-party scripts, fonts, iframes or widgets. Requests to other hosts, each allowed by name in the CSP:
`api.github.com` (download counts), `<code>.goatcounter.com` (visit pixel and total) and `api.web3forms.com`
(feedback form, only on submit). External links: GitHub profile, Make Me a Hanzi, GoatCounter.
