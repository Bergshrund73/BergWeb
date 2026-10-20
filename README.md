# BergWeb

Landing page for [BergHanziTrainer](https://bergshrund73.github.io/BergWeb/), published with GitHub Pages from `docs/`.

- `tools/build.mjs` regenerates `docs/` (images, HTML, robots.txt, sitemap.xml; the APK copy only with `--with-apk`) from the
  BergHanziTrainer checkout next to this folder (`--app <path>` to override). Build the app's release APK first.
- `tools/demo.js` is the "Попробуйте в браузере" demo (live stroke checks ported from the app); the build ships it as `docs/assets/demo.<hash>.js` with the stroke data of the first starter list words.
- `tools/check.mjs` checks local asset references, JSON-LD syntax and sitemap/robots against the canonical URL.
- `tools/serve.mjs` serves a build locally: `node build.mjs --out ../build/local --base http://localhost:8000/`,
  then `node serve.mjs ../build/local 8000`.
- Hosting notes: `docs/SERVER-SETUP.md`; asset rights: `docs/ASSETS.md`.

`.tools/` (git-ignored) holds a portable Node 22 and Lighthouse 13.4.1 for this machine.
