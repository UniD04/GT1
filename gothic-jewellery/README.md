# Vesperthorn Atelier — gothic jewellery shop

A zero-dependency Node website for a gothic jewellery atelier: landing page with a 3D scroll hero, a collection of
pieces with live 3D viewers, a shop, **The Midnight Reel** (scroll-activated video cards), a social section, popup
banners, visitor insights and an admin panel. Midnight palette of black, deep burgundy, aged silver and bone, with
blackletter headings, ornate silver double-frames and a candlelit cathedral mood.

It is the gothic re-theme of `../ollivanders/` (same structure, same server, same data shape, which is untouched).
A reusable, config-driven version lives in `../gothic-template/`.

## Run

```bash
node server.js          # http://localhost:3000   (PORT=3111 node server.js to change the port)
```

Admin panel: <http://localhost:3000/admin.html>, default password `nightshade`
(`ADMIN_PASSWORD=your-secret node server.js` to change it). On Windows, double-click `start-site.bat`.

No `npm install` is needed. The browser loads three.js, GSAP and anime.js from the jsDelivr CDN and the fonts from
Google Fonts, so a visitor needs internet access.

## Pages

| URL | What it is |
| --- | --- |
| `/` | Hero (3D pieces scrolling past a pointed-arch window), about band, Midnight Reel teasers, **social section**, popup banners |
| `/pieces.html` | The collection, filterable by type (rings, pendants, chokers, crosses), live 3D cards |
| `/piece.html?id=…` | One piece: draggable 3D viewer, specs, price, contact, and an actual-size picture with a mm / inch ruler |
| `/reels.html` | **The Midnight Reel**: a continuous feed of arch-window video cards, each wakes as it scrolls to the middle |
| `/shop.html` | Accessories and miscellaneous items (`?cat=accessories` / `?cat=misc`) |
| `/admin.html` | Edit everything, banners, social links, upload 3D models, view insights |

### The Midnight Reel

Each piece becomes a card. If the piece has a `video` URL (`.mp4` / `.webm`) in `data.json` (or in Admin → Pieces)
that clip plays; otherwise the card shows a cinematic live 3D turntable of the piece in the same frame, with film
grain, a REC light, a running timecode and a progress bar. Cards are dim and paused until they reach the middle of the
screen; then they light up and play, the title rises letter by letter (anime.js), and embers drift up the page.
Click a card to pause or play. `prefers-reduced-motion` is respected.

## Data (`data.json`)

Same shape as the original shop, re-named for jewellery:

```
site     name, tagline, heroTitle, heroText, aboutTitle, aboutText, footer, contactEmail, ctaText, ctaUrl,
         socialTitle, socialText, social: [{ name, handle, url }]
pieces   id, name, type (ring|pendant|choker|cross), metal, gemstone, size, price, color, description, model, video?, image?
shop     id, name, price, color, icon, description, category (accessories|misc), image?
banners  announcement { … raven } and event { … bat }
```

Changes from the Ollivanders data: `wands`→`pieces`, `wood`→`metal`, `core`→`gemstone`, `length`→`size`
(for example `Ø 26mm` or `52mm`; it drives the ruler), `owl`→`raven`, `snitch`→`bat`, plus the new optional
`video` and `social`.

## 3D models

```bash
node gen-models.js      # writes public/models/*.obj|stl and links them in data.json
```

Generates eight parametric pieces (skull ring, rose ring, raven and bat pendants, two crosses, thorn and chain
chokers) plus `default.obj`. Pieces face +Z with +Y up. The viewer re-centres and re-scales any `.stl`, `.obj` or
`.glb` you upload from the admin panel.

## Files

`server.js` static files, JSON API, visitor events and insights · `public/` the site · `public/reels.js|css` the
reel cards · `public/banners.*` popup banners · `public/insights.js` admin charts · `events.ndjson` visitor log
(created at run time, git-ignored).
