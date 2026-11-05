// Video "reel" cards: a feed of gothic arch-window screens that wake up as they scroll into the middle of the viewport.
// A piece with a `video` URL in data.json plays that clip; every other piece gets a live 3D turntable shot in the same frame.
// Animation: anime.js (loaded from the page, optional – the cards still work with plain CSS transitions if it is missing).
import { mountViewer } from '/viewer.js';

const A = () => window.anime;
const pad = n => String(Math.floor(n)).padStart(2, '0');
const stamp = s => `${pad(s / 3600)}:${pad(s / 60 % 60)}:${pad(s % 60)}`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ARCH = '<svg class="reel-arch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1 100 V37 C1 21 21 7 50 1 C79 7 99 21 99 37 V100" vector-effect="non-scaling-stroke"/><path class="in" d="M5 100 V38 C5 24 24 11 50 5.5 C76 11 95 24 95 38 V100" vector-effect="non-scaling-stroke"/></svg>';

/** HTML for one card. `compact` = the small teaser version used on the landing page. */
export const reelHTML = (p, i, compact = false) => {
  const video = safeUrl(p.video);
  return `<article class="reel${compact ? ' compact' : ''}${i % 2 ? ' flip' : ''}" data-reel="${esc(p.id)}">
    <div class="reel-frame">
      <div class="reel-media">${video ? `<video muted loop playsinline preload="metadata" src="${esc(video)}"></video>` : ''}</div>
      <div class="reel-glow"></div><div class="reel-vignette"></div><div class="reel-grain"></div>
      ${ARCH}
      <div class="reel-hud"><span class="rec"><i></i>${video ? 'PLAY' : 'REC'}</span><span class="tc">00:00:00</span></div>
      <div class="reel-bar"><i></i></div>
      <button class="reel-toggle" type="button" aria-label="Play or pause"><span>▶</span></button>
    </div>
    <div class="reel-info">
      <div class="meta">${esc(String(i + 1).padStart(2, '0'))} · ${esc(p.type || 'piece')} · ${esc(p.price)}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description)}</p>
      <div class="reel-spec">${esc([p.metal, p.gemstone].filter(Boolean).join(' · '))}</div>
      <a class="btn" href="/piece.html?id=${encodeURIComponent(p.id)}">${esc(L('viewPiece', 'View the piece'))}</a>
    </div>
  </article>`;
};

/** Wire every .reel inside `root`: media, activation on scroll, timecode, progress, embers. Returns a cleanup function. */
export function initReels(root, pieces) {
  const cards = [...root.querySelectorAll('.reel')].map((el, i) => {
    const p = pieces[i], media = el.querySelector('.reel-media'), vid = media.querySelector('video');
    const c = { el, p, vid, v: null, active: false, t0: 0, elapsed: 0, bar: el.querySelector('.reel-bar i'), tc: el.querySelector('.tc'), loop: null };
    if (!vid) { c.v = mountViewer(media, p, { tilt: .14 }); setTimeout(() => !c.active && c.v.setPaused(true), 2200); }   // draw the first frame, then sleep until it is the active reel
    el.querySelector('.reel-toggle').onclick = () => setActive(c, !c.active, true);
    // text: split the title into letters so anime.js can raise them one by one
    const h = el.querySelector('h3'); h.innerHTML = h.textContent.split(' ').map(w => `<span class="w">${[...w].map(ch => `<span class="ch">${esc(ch)}</span>`).join('')}</span>`).join(' ');
    return c;
  });
  let current = null;

  function setActive(c, on, manual = false) {
    if (on && current && current !== c) setActive(current, false);
    if (c.active === on) return;
    c.active = on; c.el.classList.toggle('is-active', on); current = on ? c : (current === c ? null : current);
    const a = A();
    if (c.vid) { on ? c.vid.play().catch(() => {}) : c.vid.pause(); } else { c.v.setPaused(!on); if (a) a({ targets: c.v.state, boost: on ? .9 : 0, duration: 900, easing: 'easeOutQuad' }); else c.v.state.boost = on ? .9 : 0; }
    c.el.querySelector('.reel-toggle span').textContent = on ? '❚❚' : '▶';
    if (!on) { c.loop && c.loop.pause(); return; }
    c.t0 = performance.now() - c.elapsed;
    if (a && !reduced) {
      const q = sel => c.el.querySelectorAll(sel);
      a.timeline({ easing: 'easeOutExpo' })
        .add({ targets: c.el.querySelector('.reel-frame'), scale: [.94, 1], duration: 900 })
        .add({ targets: q('.reel-info .meta, .reel-info p, .reel-info .reel-spec, .reel-info .btn'), translateY: [22, 0], opacity: [0, 1], delay: a.stagger(90), duration: 800 }, 150)
        .add({ targets: q('h3 .ch'), translateY: ['.9em', 0], rotateX: [-70, 0], opacity: [0, 1], delay: a.stagger(28), duration: 900 }, 100);
      if (!c.loop) c.loop = a({ targets: c.bar, width: ['0%', '100%'], duration: c.vid ? 6000 : 8000, easing: 'linear', loop: true, autoplay: false });
      c.loop.play();
    }
  }

  // timecode + progress follow the clip (or the turntable clock) while a card is active
  let raf; (function tick() {
    raf = requestAnimationFrame(tick);
    if (!current) return;
    const c = current, s = c.vid && isFinite(c.vid.currentTime) ? c.vid.currentTime : (performance.now() - c.t0) / 1000;
    c.elapsed = s * 1000; c.tc.textContent = stamp(s);
    if (c.vid && c.vid.duration && (!A() || reduced)) c.bar.style.width = (c.vid.currentTime / c.vid.duration * 100) + '%';
    else if (!A()) c.bar.style.width = ((s % 8) / 8 * 100) + '%';
  })();

  // the card whose middle is nearest the middle of the screen is the active one
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const c = cards.find(k => k.el === e.target); if (!c) continue;
      if (e.isIntersecting) setActive(c, true); else if (c.active) setActive(c, false);
    }
  }, { rootMargin: '-38% 0px -38% 0px', threshold: 0 });
  cards.forEach(c => io.observe(c.el));

  // cards fade up as they arrive (CSS transition, class added once)
  const seen = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); seen.unobserve(e.target); } }), { threshold: .08 });
  cards.forEach(c => seen.observe(c.el));
  return () => { cancelAnimationFrame(raf); io.disconnect(); seen.disconnect(); };
}

/** Floating embers behind the feed (anime.js drives them; without it they simply stay still). */
export function embers(layer, n = 22) {
  const a = A(); if (!a || reduced) return;
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i'); e.className = 'ember'; e.style.left = Math.random() * 100 + '%'; e.style.top = 60 + Math.random() * 45 + '%'; layer.appendChild(e);
    const run = () => a({ targets: e, translateY: -(260 + Math.random() * 420), translateX: (Math.random() - .5) * 120, opacity: [{ value: .85, duration: 700 }, { value: 0, duration: 2600 }], scale: [{ value: 1, duration: 300 }, { value: .2, duration: 3000 }], duration: 3600 + Math.random() * 3000, delay: Math.random() * 4000, easing: 'easeOutSine', complete: () => { e.style.top = 60 + Math.random() * 45 + '%'; e.style.left = Math.random() * 100 + '%'; run(); } });
    run();
  }
}
