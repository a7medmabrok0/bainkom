# Bainkom — homepage concept

Static homepage redesign for [bainkom.com](https://www.bainkom.com/ar): interactive villa hero (wireframe → realistic reveal), services, packages, scroll-driven "how it works", style-quiz CTA, designers, reviews, blog and footer. Arabic (RTL), IBM Plex Sans Arabic + Google Sans.

No build step — it's plain HTML/CSS/JS.

## Files

- `index.html` — the page
- `styles.css` — base styles for the interactive hero
- `site.css` — the rest of the site (sections, mobile app layout)
- `reveal.js` — hero reveal (water mask, drops, spring physics, auto-wander on phones)
- `site.js` — counters, carousels, steps, AI assistant, small interactions
- `assets/` — video, villa images, fonts (OFL licences included), designer photo

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173

## Deploy (GitHub Pages + subdomain)

1. Push this folder to a GitHub repository.
2. Repo → Settings → Pages → Source: `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. Put the subdomain in the `CNAME` file (e.g. `bainkom.example.com`) and commit it.
4. At your DNS provider add a `CNAME` record: name = the subdomain part (e.g. `bainkom`), value = `<your-github-username>.github.io`.
5. Back in Settings → Pages, wait for the DNS check, then tick **Enforce HTTPS**.

When you change CSS/JS, bump the `?v=` number on the links in `index.html` so browsers load the new files.

## Notes

- Most photos are loaded directly from bainkom.com / its S3 bucket.
- The page has `noindex` so search engines don't list it as a copy of bainkom.com; remove that meta tag if this becomes the real site.
- The AI assistant gives canned replies; it is not connected to a real model yet.
