# Hosting: GitHub Pages

Canonical URL: `https://bergshrund73.github.io/BergWeb/`

## Publish

1. Rebuild after every app release: `cd tools && npm install && node build.mjs` (add `--with-apk` to publish the APK; without it the download buttons are a stub)
   (expects the BergHanziTrainer checkout next to this repository, or pass `--app <path>`; build the release APK there first; reads `versionName` from `app/build.gradle.kts`, copies the release APK, regenerates images and HTML).
2. Commit `docs/` and push to `main`.
3. Once: repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**,
   and tick **Enforce HTTPS**. The repository must be public on a free GitHub plan.

`docs/.nojekyll` turns Jekyll off so files are served as-is.

## What GitHub Pages does and does not allow

| Requirement | Status on GitHub Pages |
|---|---|
| HTTPS + HTTP→HTTPS redirect | Provided by GitHub (Enforce HTTPS). |
| Brotli/gzip | gzip is served by GitHub's CDN; Brotli is not configurable — not claimed. |
| `Cache-Control` | Fixed by GitHub (`max-age=600` for every file). `immutable` for fingerprinted assets is **not possible** here; filenames are still fingerprinted so a move to a configurable host needs no HTML change. |
| Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, HSTS) | Custom headers are **not configurable**. The page ships a `<meta>` Content-Security-Policy (inline style authorised by a SHA-256 hash, no scripts) and a `<meta name="referrer">`. `frame-ancestors` cannot be set via `<meta>`. Put a CDN (e.g. Cloudflare) in front if real headers are needed. |
| MIME types | `.html`, `.avif`, `.webp`, `.jpg`, `.png`, `.txt`, `.xml`, `.apk` are served with correct types by GitHub. Verify after deploy: `curl -sI <url>` per file type. |
| File size | Single files up to 100 MB. The APK (published only with `--with-apk`) is ~55 MB: git warns above 50 MB but accepts it. Each new APK version grows the repository history; if that becomes a problem, attach the APK to a GitHub Release and point `APK_URL` in `build.mjs` at it. |

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

## Third-party dependencies

None on any load: no scripts, fonts, iframes or widgets. External links only (GitHub profile, Make Me a Hanzi).
