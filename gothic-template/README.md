# Gothic shop template

A reusable, **config-driven** gothic jewellery website: a 3D scroll hero, a collection with live 3D viewers, a shop,
**The Midnight Reel** (scroll-activated video cards), a social section, popup banners, visitor insights and an admin
panel. Pure Node, no dependencies, no build step.

It is derived from `../gothic-jewellery/` (the Vesperthorn Atelier site). Everything that was specific to that shop
now lives in two files:

| File | What it holds |
| --- | --- |
| **`site.config.json`** | shop name, tagline, hero / about / footer copy, contact email, social links, page labels, piece types, shop categories, **colours (dark + light), fonts, default mode, admin password, port** |
| **`data.json`** | the products (`pieces`, `shop`), the two banners, and any copy edits made in the admin panel |

## Run

```bash
node server.js            # http://localhost:3000
```

Admin panel: <http://localhost:3000/admin.html>. The password is `adminPassword` in `site.config.json`
(default `change-me-please`, **change it**), or set it per run: `ADMIN_PASSWORD=secret node server.js`.
`PORT=3111 node server.js` changes the port. On Windows double-click `start-site.bat`. `npm start` also works.

The browser loads three.js, GSAP and anime.js from the jsDelivr CDN and fonts from Google Fonts, so visitors need internet access.

## Make it yours

1. **Name and copy.** Edit the `site` block in `site.config.json`. The admin panel's *Website* tab edits the same
   fields; whatever you change there is stored in `data.json` under `site` and wins over the config. Delete the
   `site` block in `data.json` (leave `{}`) to go back to the config.
2. **Colours.** `theme.colors.dark` and `theme.colors.light` become CSS variables in `/theme.css`. Set
   `theme.defaultMode` to `"dark"` or `"light"`; visitors can toggle and the choice is remembered.

   | Config key | CSS variable | Used for |
   | --- | --- | --- |
   | `background` / `surface` | `--bg` / `--bg2` | page and card background |
   | `text` / `muted` / `heading` | `--ink` / `--mute` / `--head` | body text, secondary text, headings |
   | `accent` / `onAccent` | `--gold` / `--on` | buttons, links, highlights and the text on them |
   | `metal` / `bone` | `--gilt` / `--cream` | silver trim, ornaments, and light text on dark panels |
   | `panel` | `--maroon` | hero window, about band, menu |
   | `line`, `pictureBg`, `header`, `field`, `shadow` | `--line --pic --hdr --field --shade` | borders, picture wells, header, inputs, shadows |
   | `candleGlow`, `vignette` | `--candle`, `--vig` | the flickering glow and the dark edges |

3. **Fonts.** `theme.fonts` has `heading`, `label` and `body` (CSS `font-family` values) and `googleFontsUrl`
   (any Google Fonts CSS URL that loads them). Defaults: UnifrakturCook (blackletter), Cinzel and EB Garamond.
4. **Labels and wording.** `labels` holds the nav, page titles, button text and the Midnight Reel texts.
   Leave a key out to use the built-in English default. `pieceTypes` defines the filter chips and the admin Type
   list; `shopCategories` names the two shop categories (`accessories`, `misc`).
5. **Products.** Edit them in the admin panel, or in `data.json`:
   `pieces[]` = `id, name, type, metal, gemstone, size, price, color, description, model, video?, image?`
   (`size` like `Ø 22mm` or `52mm` drives the ruler on the piece page; `type` must be one of your `pieceTypes` ids),
   `shop[]` = `id, name, price, color, icon, description, category, image?`.
6. **Banners.** The announcement and event popups are in `data.json` → `banners` and in the admin *Banners* tab.
7. **3D models.** The sample pieces are generic placeholders. Upload your own `.stl`, `.obj` or `.glb` per piece in
   the admin panel (they are re-centred and scaled automatically, front facing +Z, up +Y), or put files in
   `public/models/` and set the piece's `model` path. `node gen-models.js` regenerates the placeholders.
8. **Videos for the reel.** Put a `video` URL (`.mp4` / `.webm`) on a piece. Without one the Midnight Reel card
   shows a live 3D turntable of the piece instead.

The popup banner artwork (parchment, ravens, bats, the cathedral) and the ember colours are fixed illustrations;
everything else follows the theme.

## How it fits together

```
server.js            static files + JSON API + visitor events + insights
                     /config.js   public part of site.config.json (never the password)
                     /theme.css   CSS variables and fonts generated from the config (read on every request)
                     /api/data    data.json with the `site` copy merged over site.config.json
public/              the site (style.css, app.js, viewer.js, reels.js/css, banners.*, insights.js, pages)
gen-models.js        generates the placeholder meshes
```

Config edits apply on the next page refresh; no restart is needed. `events.ndjson` (visitor log) is created at run
time and git-ignored.
