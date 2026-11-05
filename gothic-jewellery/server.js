// Zero-dependency server: static files + JSON API + visitor insights. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || 'nightshade';
const DATA = path.join(__dirname, 'data.json'), PUB = path.join(__dirname, 'public');
const EVENTS = path.join(__dirname, 'events.ndjson');           // append-only visitor event log (one JSON object per line)
const tokens = new Set();
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const body = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 5e6) req.destroy(); }); req.on('end', () => r(b)); });
const smallBody = (req, limit = 2048) => new Promise(r => { let b = '', over = false; req.on('data', c => { if (b.length + c.length > limit) over = true; else b += c; }); req.on('end', () => r(over ? null : b)); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const authed = req => tokens.has((req.headers.authorization || '').replace('Bearer ', ''));

// ── visitor events + hearts ───────────────────────────────────────────────────
// event: { t: ms, v: visitor id, type, id?, page?, src?, dev?, theme?, d?: 1 if generated sample data }
const EVENT_TYPES = new Set(['pageview', 'view', 'like', 'unlike', 'contact', 'shop', 'badge', 'filter', 'banner', 'bannerclick', 'social']);
let events = [];
try { events = fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
if (events.length > 300000) events = events.slice(-300000);

const applyLike = (e, sets) => {
  if (e.type === 'like') { if (!sets.has(e.id)) sets.set(e.id, new Set()); sets.get(e.id).add(e.v); }
  else if (e.type === 'unlike') sets.get(e.id)?.delete(e.v);
};
const buildLikes = list => { const s = new Map(); list.forEach(e => applyLike(e, s)); return s; };
let likeSets = buildLikes(events.filter(e => !e.d));            // public heart counts never include sample data
const publicLikes = () => Object.fromEntries([...likeSets].map(([k, s]) => [k, s.size]).filter(([, n]) => n > 0));

const hits = new Map();                                          // per-IP rate limit for the public event endpoint
const allow = ip => { const now = Date.now(), h = hits.get(ip); if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60000 }); return true; } return ++h.n <= 120; };
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k); }, 120000).unref();

const clean = (s, max, re) => typeof s === 'string' && s.length <= max && re.test(s) ? s : undefined;
function recordEvent(b) {
  const e = {
    t: Date.now(), v: clean(b.v, 64, /^[\w-]{3,64}$/), type: b.type,
    id: clean(b.id, 80, /^[\w:.-]{1,80}$/), page: clean(b.page, 120, /^[\w\/.?=&%-]{1,120}$/), src: clean(b.src, 60, /^[\w. -]{1,60}$/),
    dev: ['mobile', 'tablet', 'desktop'].includes(b.dev) ? b.dev : undefined, theme: ['light', 'dark'].includes(b.theme) ? b.theme : undefined,
  };
  if (!e.v || !EVENT_TYPES.has(e.type)) return false;
  if (['like', 'unlike', 'view', 'contact', 'shop', 'filter', 'banner', 'bannerclick', 'social'].includes(e.type) && !e.id) return false;
  if (e.type === 'like' && likeSets.get(e.id)?.has(e.v)) return true;       // already hearted by this visitor
  if (e.type === 'unlike' && !likeSets.get(e.id)?.has(e.v)) return true;
  events.push(e); applyLike(e, likeSets);
  fs.appendFile(EVENTS, JSON.stringify(e) + '\n', () => {});
  return true;
}

// ── insights ──────────────────────────────────────────────────────────────────
const num = p => parseFloat(String(p || '').replace(/[^\d.]/g, '')) || 0;
function computeInsights() {
  const data = JSON.parse(fs.readFileSync(DATA)), DAY = 864e5, DAYS = 14;
  const start = new Date(); start.setHours(0, 0, 0, 0); const t0 = start.getTime() - (DAYS - 1) * DAY;
  const win = events.filter(e => e.t >= t0);
  const series = Array.from({ length: DAYS }, (_, i) => ({ label: new Date(t0 + i * DAY).toLocaleDateString('en', { month: 'short', day: 'numeric' }), pv: 0, vis: new Set(), likes: 0, contacts: 0 }));
  const hours = Array(24).fill(0), visitors = new Set(), vDays = new Map(), src = new Map(), dev = new Map(), theme = new Map();
  const pages = new Map(), soc = new Map(), filters = new Map(), viewed = new Set(), hearted = new Set(), contacted = new Set(), badgeV = new Set();
  const item = k => (items[k] ||= { views: 0, contacts: 0, shop: 0 }), items = {};
  const bn = { announcement: { views: 0, clicks: 0 }, event: { views: 0, clicks: 0 } };
  let pageviews = 0, pieceViews = 0, contacts = 0, badge = 0;
  for (const e of win) {
    const di = Math.min(DAYS - 1, Math.max(0, Math.floor((e.t - t0) / DAY))), s = series[di];
    visitors.add(e.v); (vDays.get(e.v) || vDays.set(e.v, new Set()).get(e.v)).add(di);
    if (e.dev) dev.set(e.v, e.dev); if (e.theme) theme.set(e.v, e.theme);
    switch (e.type) {
      case 'pageview':
        pageviews++; s.pv++; s.vis.add(e.v); hours[new Date(e.t).getHours()]++;
        if (e.page) pages.set(e.page, (pages.get(e.page) || 0) + 1);
        if (e.src) (src.get(e.src) || src.set(e.src, new Set()).get(e.src)).add(e.v);
        break;
      case 'view': item(e.id).views++; if (e.id.startsWith('piece:')) { pieceViews++; viewed.add(e.v); } break;
      case 'like': s.likes++; hearted.add(e.v); break;
      case 'contact': item(e.id).contacts++; contacts++; s.contacts++; contacted.add(e.v); break;
      case 'shop': item(e.id).shop++; break;
      case 'social': soc.set(e.id, (soc.get(e.id) || 0) + 1); break;
      case 'badge': badge++; badgeV.add(e.v); break;
      case 'banner': if (bn[e.id]) bn[e.id].views++; break;
      case 'bannerclick': if (bn[e.id]) bn[e.id].clicks++; break;
      case 'filter': filters.set(e.id, (filters.get(e.id) || 0) + 1); break;
    }
  }
  const allLikes = buildLikes(events);                                   // net hearts, all time, sample data included
  const rows = [
    ...data.pieces.map(w => ({ key: 'piece:' + w.id, kind: 'piece', name: w.name, cat: w.type || 'ring', price: w.price || '', color: w.color })),
    ...data.shop.map(p => ({ key: 'shop:' + p.id, kind: 'shop', name: p.name, cat: p.category || 'accessories', price: p.price || '', color: p.color })),
  ].map(r => {
    const i = items[r.key] || { views: 0, contacts: 0, shop: 0 }, hearts = allLikes.get(r.key)?.size || 0, p = num(r.price);
    return { ...r, views: i.views, hearts, contacts: i.contacts, shopClicks: i.shop, heartRate: i.views ? Math.min(100, Math.round(hearts / i.views * 1000) / 10) : null, priceNum: p, pipeline: p * i.contacts, wishlist: p * hearts, score: i.views + 3 * hearts + 8 * i.contacts };
  });
  const top = (m, n = 6) => [...m].map(([name, v]) => ({ name, n: v instanceof Set ? v.size : v })).sort((a, b) => b.n - a.n).slice(0, n);
  const count = m => { const c = new Map(); m.forEach(v => c.set(v, (c.get(v) || 0) + 1)); return top(c); };
  const pageName = { '/': 'Home', '/index.html': 'Home', '/pieces.html': 'Pieces', '/piece.html': 'Piece detail', '/reels.html': 'The Midnight Reel', '/shop.html': 'Shop (all)', '/shop.html?cat=accessories': 'Accessories', '/shop.html?cat=misc': 'Misc' };
  const sections = top(new Map([...pages].reduce((m, [p, n]) => { const k = pageName[p]; if (k) m.set(k, (m.get(k) || 0) + n); return m; }, new Map())), 8);
  const returning = [...vDays.values()].filter(s => s.size > 1).length;
  const peak = hours.indexOf(Math.max(...hours));
  const kpi = {
    pageviews, visitors: visitors.size, returningPct: visitors.size ? Math.round(returning / visitors.size * 100) : 0, pieceViews,
    hearts: rows.reduce((a, r) => a + r.hearts, 0), heartedVisitors: hearted.size, contacts, badge,
    wishlistValue: rows.reduce((a, r) => a + r.wishlist, 0), pipelineValue: rows.reduce((a, r) => a + r.pipeline, 0),
  };
  // plain-language suggestions for a marketer / salesperson
  const tips = [], wr = rows.filter(r => r.kind === 'piece'), byHearts = [...rows].sort((a, b) => b.hearts - a.hearts);
  if (byHearts[0]?.hearts > 0) tips.push(`“${byHearts[0].name}” is the most loved item (${byHearts[0].hearts} ♥). Lead with it in the hero and in social posts.`);
  const quiet = wr.filter(r => r.hearts >= 3 && r.contacts === 0).sort((a, b) => b.hearts - a.hearts)[0];
  if (quiet) tips.push(`People love “${quiet.name}” (${quiet.hearts} ♥) but nobody has contacted you about it. Add a clearer price or offer and a stronger call to action.`);
  const lowHeart = wr.filter(r => r.views >= 10 && r.heartRate !== null && r.heartRate < 5).sort((a, b) => b.views - a.views)[0];
  if (lowHeart) tips.push(`“${lowHeart.name}” gets views (${lowHeart.views}) but few hearts (${lowHeart.heartRate}%). Try a better description or photo.`);
  const hot = [...rows].filter(r => r.pipeline > 0).sort((a, b) => b.pipeline - a.pipeline)[0];
  if (hot) tips.push(`Hottest lead: “${hot.name}” — ${hot.contacts} contact click${hot.contacts > 1 ? 's' : ''}, about ${Math.round(hot.pipeline)} in potential sales. Follow up first.`);
  if (hours[peak] > 0) tips.push(`Visits peak around ${String(peak).padStart(2, '0')}:00 (server time). Schedule posts, drops and emails just before then.`);
  const topSrc = top(src, 1)[0]; if (topSrc && visitors.size >= 10) tips.push(`Most traffic comes from “${topSrc.name}” (${topSrc.n} visitors). Add ?ref=name to your links to compare channels.`);
  const mob = [...dev.values()].filter(d => d === 'mobile').length; if (dev.size >= 10 && mob / dev.size > .5) tips.push(`${Math.round(mob / dev.size * 100)}% of visitors are on phones. Check every photo and button on a small screen.`);
  if (visitors.size >= 20 && badge / visitors.size < .03) tips.push(`Few visitors click the “Fulfilled by” badge (${badge}). Move it higher or give it a more inviting label.`);
  for (const [k, label] of [['announcement', 'announcement'], ['event', 'event']]) { const b = bn[k]; if (b.views >= 15 && b.clicks / b.views < .05) tips.push(`The ${label} banner is seen (${b.views}) but rarely clicked (${Math.round(b.clicks / b.views * 100)}%). Try a clearer button label or a stronger first line.`); }
  if (!tips.length) tips.push('Not enough activity yet for suggestions. Share the site, or generate sample data to preview this page.');
  return {
    hasDemo: events.some(e => e.d), hasReal: events.some(e => !e.d), days: DAYS, kpi,
    series: series.map(s => ({ label: s.label, pv: s.pv, vis: s.vis.size, likes: s.likes, contacts: s.contacts })),
    items: rows, hours, peakHour: peak,
    funnel: [{ label: 'Visitors', n: visitors.size }, { label: 'Viewed a piece', n: viewed.size }, { label: 'Hearted something', n: hearted.size }, { label: 'Contacted you', n: contacted.size }],
    banners: bn, social: top(soc), sources: top(src), devices: count(dev), themes: count(theme), filters: top(filters), sections, tips,
  };
}

// sample data so the Insights tab can be previewed; every sample event carries d:1 and can be removed again
function genDemo() {
  const data = JSON.parse(fs.readFileSync(DATA)), DAY = 864e5, now = Date.now(), r = Math.random;
  const pick = a => a[Math.floor(r() * a.length)], wpick = (items, ws) => { let x = r() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) if ((x -= ws[i]) < 0) return items[i]; return items.at(-1); };
  const pieces = data.pieces.map(w => w.id), accs = data.shop.map(p => p.id), wTypes = ['ring', 'pendant', 'choker', 'cross'];
  const wW = pieces.map((_, i) => Math.pow(.62, i) + .15), out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 170; i++) {
    const v = 'demo-' + crypto.randomBytes(5).toString('hex'), dev = r() < .58 ? 'mobile' : r() < .2 ? 'tablet' : 'desktop', theme = r() < .55 ? 'dark' : 'light';
    const src = wpick(['direct', 'instagram', 'google', 'tiktok', 'newsletter', 'facebook'], [.34, .24, .2, .1, .07, .05]);
    const sessions = r() < .3 ? 2 + Math.floor(r() * 2) : 1, liked = new Set();
    for (let s = 0; s < sessions; s++) {
      const day = Math.floor(Math.pow(r(), 1.4) * 14), hour = pick([9, 10, 12, 13, 18, 19, 20, 20, 21, 21, 22, 23]);
      let t = Math.min(now - 1000, today.getTime() - day * DAY + hour * 36e5 + r() * 36e5);
      const add = (o) => { out.push({ t: Math.round(t), v, d: 1, dev, theme, ...o }); t += 3000 + r() * 40000; };
      add({ type: 'pageview', page: '/', src: s === 0 ? src : 'direct' });
      if (r() < .85) { add({ type: 'pageview', page: '/pieces.html' }); if (r() < .4) add({ type: 'filter', id: pick(wTypes) }); }
      const seen = new Set(); for (let n = 1 + Math.floor(r() * 3); n > 0; n--) seen.add(wpick(pieces, wW));
      for (const id of seen) {
        add({ type: 'pageview', page: '/piece.html' }); add({ type: 'view', id: 'piece:' + id });
        if (r() < .22 && !liked.has('piece:' + id)) { liked.add('piece:' + id); add({ type: 'like', id: 'piece:' + id }); }
        if (r() < .05) { add({ type: 'contact', id: 'piece:' + id }); if (r() < .3) add({ type: 'shop', id: 'piece:' + id }); }
      }
      if (r() < .45) {
        add({ type: 'pageview', page: pick(['/shop.html', '/shop.html?cat=accessories', '/shop.html?cat=misc']) });
        for (let n = 1 + Math.floor(r() * 2); n > 0; n--) { const id = 'shop:' + wpick(accs, accs.map((_, i) => 1 / (i + 1))); if (r() < .22 && !liked.has(id)) { liked.add(id); add({ type: 'like', id }); } }
      }
      if (r() < .3) add({ type: 'pageview', page: '/reels.html' });
      if (r() < .1) add({ type: 'social', id: pick(['Instagram', 'TikTok', 'YouTube', 'Pinterest']) });
      if (r() < .06) add({ type: 'badge' });
      if (r() < .7) { add({ type: 'banner', id: 'announcement' }); if (r() < .14) add({ type: 'bannerclick', id: 'announcement' }); }
      if (r() < .45) { add({ type: 'banner', id: 'event' }); if (r() < .09) add({ type: 'bannerclick', id: 'event' }); }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.socket.remoteAddress || '?';
  if (url.pathname === '/api/data' && req.method === 'GET') return res.writeHead(200, { 'Content-Type': 'application/json' }), res.end(fs.readFileSync(DATA));
  if (url.pathname === '/api/likes' && req.method === 'GET') return send(res, 200, publicLikes());
  if (url.pathname === '/api/event' && req.method === 'POST') {
    if (!allow(ip)) return send(res, 429, { error: 'Slow down' });
    const raw = await smallBody(req); let b; try { b = JSON.parse(raw); } catch {}
    if (!b || typeof b !== 'object' || !recordEvent(b)) return send(res, 400, { error: 'Bad event' });
    return send(res, 200, { ok: true });
  }
  if (url.pathname === '/api/insights' && req.method === 'GET') { if (!authed(req)) return send(res, 401, { error: 'Unauthorized' }); return send(res, 200, computeInsights()); }
  if (url.pathname === '/api/insights/demo' && ['POST', 'DELETE'].includes(req.method)) {
    if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
    if (req.method === 'POST') {
      events = events.filter(e => !e.d); const demo = genDemo(); events.push(...demo); events.sort((a, b) => a.t - b.t);
    } else events = events.filter(e => !e.d);
    fs.writeFileSync(EVENTS, events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
    likeSets = buildLikes(events.filter(e => !e.d));
    return send(res, 200, { ok: true, events: events.length });
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    let p; try { p = JSON.parse(await body(req)).password; } catch {}
    if (p !== PASSWORD) return send(res, 401, { error: 'Wrong password' });
    const t = crypto.randomBytes(24).toString('hex'); tokens.add(t); return send(res, 200, { token: t });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') { tokens.delete((req.headers.authorization || '').replace('Bearer ', '')); return send(res, 200, { ok: true }); }
  if (url.pathname === '/api/upload' && req.method === 'PUT') {
    if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
    const name = path.basename(url.searchParams.get('name') || '');
    if (!/^[\w.-]+\.(stl|obj|glb)$/i.test(name)) return send(res, 400, { error: 'Only .stl, .obj or .glb files' });
    const chunks = []; let size = 0, tooBig = false;
    req.on('data', c => { size += c.length; if (size > 40e6) tooBig = true; else chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return send(res, 413, { error: 'File too large (40MB max)' });
      fs.mkdirSync(path.join(PUB, 'models'), { recursive: true });
      fs.writeFileSync(path.join(PUB, 'models', name), Buffer.concat(chunks));
      send(res, 200, { url: '/models/' + name });
    });
    return;
  }
  if (url.pathname === '/api/data' && req.method === 'PUT') {
    if (!authed(req)) return send(res, 401, { error: 'Unauthorized' });
    try { const d = JSON.parse(await body(req)); if (!d.site || !d.pieces || !d.shop) throw 0; fs.writeFileSync(DATA, JSON.stringify(d, null, 2)); return send(res, 200, { ok: true }); }
    catch { return send(res, 400, { error: 'Invalid data' }); }
  }
  let f = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(PUB, path.normalize(f));
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Vesperthorn Atelier running at http://localhost:${PORT}  (admin: /admin.html, password: ${PASSWORD})`));
