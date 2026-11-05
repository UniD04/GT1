const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^(https?:\/\/|data:image\/)/i.test(u || '') ? u : '';
const safeColor = (c, fallback = '#9a9aa6') => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback;
const safeMail = m => /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/.test(m || '') ? m : '';
const loadData = () => fetch('/api/data').then(r => r.json());

// theme: remembered choice, applied before anything renders
const getTheme = () => { try { return localStorage.getItem('theme'); } catch { return null; } };
document.documentElement.dataset.theme = getTheme() || 'dark';

// ── visitor tracking (anonymous: a random id kept in this browser, no personal data) ──
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const vid = (() => { let v = store.get('vid'); if (!v) { v = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('vid', v); } return v; })();
const isAdminPage = location.pathname.startsWith('/admin');
function track(type, id, extra = {}) {
  if (isAdminPage) return;
  const body = JSON.stringify({ v: vid, type, id, dev: innerWidth < 700 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop', theme: document.documentElement.dataset.theme, ...extra });
  try { navigator.sendBeacon ? navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' })) : fetch('/api/event', { method: 'POST', body, keepalive: true }); } catch {}
}
if (!isAdminPage && location.pathname !== '/blank.html') {                    // one pageview per page load; the traffic source is sent once per browser session
  const q = new URLSearchParams(location.search), cat = q.get('cat');
  let src; try { if (!sessionStorage.getItem('sess')) { sessionStorage.setItem('sess', '1'); src = q.get('utm_source') || q.get('ref') || (document.referrer ? new URL(document.referrer).hostname : '') || 'direct'; } } catch {}
  track('pageview', undefined, { page: location.pathname + (cat && /^\w+$/.test(cat) ? '?cat=' + cat : ''), src: src && src.replace(/[^\w. -]/g, '').slice(0, 60) || undefined });
}

// ── hearts: stored per visitor in this browser, counted on the server ──
const liked = new Set((() => { try { return JSON.parse(store.get('liked') || '[]'); } catch { return []; } })());
let heartCounts = {}, heartsLoaded = false;
const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const heartBtn = key => `<span class="heart-btn" role="button" tabindex="0" data-heart="${esc(key)}" aria-pressed="false" aria-label="Like"><svg viewBox="0 0 24 24"><path d="${HEART_PATH}"/></svg><b class="hn"></b></span>`;
function paintHearts() {
  document.querySelectorAll('[data-heart]').forEach(el => {
    const k = el.dataset.heart, on = liked.has(k), n = Math.max(0, heartCounts[k] || 0);
    const hn = el.querySelector('.hn'), txt = heartsLoaded && n ? String(n) : '';
    el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); if (hn.textContent !== txt) hn.textContent = txt;   // only write on change, or the observer below would loop
  });
}
function toggleHeart(el) {
  const k = el.dataset.heart, on = !liked.has(k);
  on ? liked.add(k) : liked.delete(k); store.set('liked', JSON.stringify([...liked]));
  heartCounts[k] = Math.max(0, (heartCounts[k] || 0) + (on ? 1 : -1));
  track(on ? 'like' : 'unlike', k); paintHearts();
  if (window.gsap) {                                                           // little pop, plus a few sparks when liking
    const svg = el.querySelector('svg'); gsap.fromTo(svg, { scale: .6 }, { scale: 1, duration: .55, ease: 'elastic.out(1.2, .45)' });
    if (on) for (let i = 0; i < 7; i++) {
      const s = document.createElement('i'), ang = Math.random() * Math.PI * 2; s.className = 'heart-spark'; el.appendChild(s);
      gsap.fromTo(s, { x: 0, y: 0, opacity: 1, scale: 1 }, { x: Math.cos(ang) * 22, y: Math.sin(ang) * 22, opacity: 0, scale: .2, duration: .6, ease: 'power2.out', onComplete: () => s.remove() });
    }
  }
}
document.addEventListener('click', e => { const h = e.target.closest('[data-heart]'); if (h) { e.preventDefault(); e.stopPropagation(); toggleHeart(h); } }, true);
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-heart]')) { e.preventDefault(); toggleHeart(e.target); } });
if (!isAdminPage) {
  fetch('/api/likes').then(r => r.json()).then(c => { heartCounts = { ...c }; liked.forEach(k => { if (!heartCounts[k]) heartCounts[k] = 1; }); heartsLoaded = true; paintHearts(); }).catch(() => { heartsLoaded = true; });
  let queued = false;                                                          // hearts are rendered dynamically (filters, scroll): repaint whenever new ones appear
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; paintHearts(); }); } }).observe(document.documentElement, { childList: true, subtree: true });
}

const pieceCardHTML = w => `<a class="card" href="/piece.html?id=${encodeURIComponent(w.id)}">${heartBtn('piece:' + w.id)}<div class="pic"></div>
  <div class="info"><div class="meta">${esc(w.metal)} · ${esc(w.size)}</div><h3>${esc(w.name)}</h3><p>${esc(w.description)}</p></div></a>`;

function pieceSVG(color = '#b9b9c4') {
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient></defs>
    <circle cx="100" cy="122" r="58" fill="none" stroke="${esc(color)}" stroke-width="14"/><circle cx="100" cy="122" r="58" fill="none" stroke="url(#${id})" stroke-width="14"/>
    <path d="M100 18 L124 46 L100 74 L76 46Z" fill="#8e1b2e"/><path d="M100 18 L124 46 L100 74 L76 46Z" fill="url(#${id})"/></svg>`;
}
const art = o => safeUrl(o.image) ? `<img src="${esc(safeUrl(o.image))}" alt="${esc(o.name)}">` : pieceSVG(o.color);

function chrome(d, active) {
  const cat = active === 'shop' ? new URLSearchParams(location.search).get('cat') : null;
  document.body.insertAdjacentHTML('afterbegin', `<header>
    <div class="hl"><a class="pill ${active === 'pieces' ? 'on' : ''}" href="/pieces.html">Pieces</a><a class="pill ${cat === 'accessories' ? 'on' : ''}" href="/shop.html?cat=accessories">Accessories</a><a class="pill ${cat === 'misc' ? 'on' : ''}" href="/shop.html?cat=misc">Misc</a><a class="pill ${active === 'reels' ? 'on' : ''}" href="/reels.html">Reels</a></div>
    <a class="brand" href="/">${esc(d.site.name)}<small>${esc(d.site.tagline)}</small></a>
    <div class="hr"><button class="theme" id="themeBtn" title="Toggle dark mode" aria-label="Toggle dark mode"></button><button class="pill" id="menuBtn">Menu</button></div></header>
    <div class="menu" id="menu"><a href="/">Home</a><a href="/pieces.html">Pieces</a><a href="/shop.html">Shop</a><a href="/reels.html">Reels</a><a href="/admin.html" class="hat" title="Admin" aria-label="Admin">
      <svg viewBox="0 0 64 64" width="44" height="44" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
        <path d="M14 58 V28 C14 16 24 8 32 4 C40 8 50 16 50 28 V58Z" fill="currentColor" fill-opacity=".15"/>
        <path d="M23 58 V32 C23 26 28 22 32 19 C36 22 41 26 41 32 V58"/><path d="M32 30 V58 M23 44 H41"/>
      </svg></a></div>`);
  const paintTheme = () => themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀' : '☾';
  themeBtn.onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {} paintTheme();
  };
  paintTheme();
  document.body.insertAdjacentHTML('beforeend', `<footer>${esc(d.site.footer)} · <a href="/admin.html">Admin</a></footer>`);
  const menu = document.getElementById('menu'), hdr = document.querySelector('header');
  const toggle = () => { menu.classList.toggle('open'); document.getElementById('menuBtn').textContent = menu.classList.contains('open') ? 'Close' : 'Menu'; };
  menuBtn.onclick = toggle;
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.contains('open') && toggle()));
  const onScroll = () => hdr.classList.toggle('solid', scrollY > 60 && !menu.classList.contains('open'));
  addEventListener('scroll', onScroll); onScroll();
}
