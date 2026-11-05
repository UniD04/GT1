// Epic banners: an "Owl Post" announcement scroll and a "night sky" event-appearance ticket.
// Shared by the landing page (Banners.autoStart) and the admin preview (Banners.show). Needs gsap, esc() and track() from app.js.
const Banners = (() => {
  const BG = 'var(--bn-bg,#fff)';
  const ICONS = {
    owl: ['Owl', `<path d="M12 24 L17 8 L28 17 Q32 15 36 17 L47 8 L52 24 V42 Q52 58 32 59 Q12 58 12 42Z"/><circle cx="23" cy="30" r="8" fill="${BG}"/><circle cx="41" cy="30" r="8" fill="${BG}"/><circle cx="23" cy="30" r="3.6"/><circle cx="41" cy="30" r="3.6"/><path d="M32 33 L27.5 42 H36.5Z" fill="${BG}"/><path d="M22 49 Q27 54 32 49 Q37 54 42 49" fill="none" stroke="${BG}" stroke-width="2" stroke-linecap="round"/>`],
    snitch: ['Golden snitch', `<circle cx="32" cy="36" r="9"/><path d="M23 34 C16 22 6 20 1 26 C9 25 15 29 23 38Z"/><path d="M41 34 C48 22 58 20 63 26 C55 25 49 29 41 38Z"/><path d="M27 31 L37 41 M37 31 L27 41" stroke="${BG}" stroke-width="1.4" fill="none" opacity=".7"/>`],
    castle: ['Castle', `<rect x="6" y="28" width="14" height="30"/><path d="M4 28 L13 12 L22 28Z"/><rect x="44" y="28" width="14" height="30"/><path d="M42 28 L51 12 L60 28Z"/><rect x="24" y="16" width="16" height="42"/><path d="M22 16 L32 1 L42 16Z"/><rect x="18" y="40" width="28" height="18"/><path d="M28 58 V50 Q32 44 36 50 V58Z" fill="${BG}"/><rect x="11" y="36" width="4" height="6" fill="${BG}"/><rect x="49" y="36" width="4" height="6" fill="${BG}"/><rect x="30" y="24" width="4" height="7" fill="${BG}"/>`],
    wand: ['Wand', `<path d="M10 54 L44 20" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M50 6 L53 14 L61 17 L53 20 L50 28 L47 20 L39 17 L47 14Z"/><circle cx="56" cy="34" r="2"/><circle cx="34" cy="8" r="2"/><circle cx="58" cy="50" r="1.6"/>`],
    hat: ['Wizard hat', `<path d="M32 4 C30 18 22 36 17 48 H47 C44 36 36 18 32 4Z"/><path d="M5 52 C5 46 18 48 32 48 C46 48 59 46 59 52 C59 58 46 60 32 60 C18 60 5 58 5 52Z"/><path d="M19 43 C27 46 37 46 45 43" stroke="${BG}" stroke-width="2.4" fill="none"/>`],
    potion: ['Potion', `<rect x="26" y="4" width="12" height="7" rx="2"/><path d="M27 11 H37 V22 Q52 30 52 44 Q52 60 32 60 Q12 60 12 44 Q12 30 27 22Z"/><path d="M15 42 Q24 38 32 42 T49 42 V46 Q49 57 32 57 Q15 57 15 46Z" fill="${BG}" opacity=".45"/><circle cx="26" cy="46" r="2.2" fill="${BG}"/><circle cx="38" cy="50" r="1.6" fill="${BG}"/>`],
    feather: ['Phoenix feather', `<path d="M52 6 C28 8 12 26 10 58 C34 54 50 38 52 6Z"/><path d="M10 58 L40 22" stroke="${BG}" stroke-width="1.8" fill="none"/>`],
    moon: ['Moon & stars', `<path d="M38 6 A26 26 0 1 0 58 42 A20 20 0 0 1 38 6Z"/><path d="M50 8 L51.8 13 L57 14.6 L51.8 16.2 L50 21 L48.2 16.2 L43 14.6 L48.2 13Z"/><circle cx="58" cy="26" r="2"/>`],
  };
  const icon = (name, cls = '') => `<svg viewBox="0 0 64 64" class="bn-icon ${cls}" fill="currentColor" aria-hidden="true">${(ICONS[name] || ICONS.owl)[1]}</svg>`;

  const defaults = {
    announcement: { enabled: false, kicker: 'Owl Post', title: 'The Winter Wand Fair Is Coming', content: 'Our newest collection of handcrafted wands arrives this season.\n\nVisit the shop for limited editions, and ask us about a custom commission.', icon: 'owl', ctaText: 'See the wands', ctaUrl: '/wands.html', sparkles: true, owl: true, frequency: 'session', delay: 3 },
    event: { enabled: false, kicker: 'Wandmaker Appearance', title: 'Meet the Wandmaker at Diagon Alley Market', content: 'Live wand fittings, demonstrations and the chance to find the wand that chooses you.', icon: 'castle', date: '', time: '14:00', location: 'Diagon Alley Market Hall, London', ctaText: 'Reserve a fitting', ctaUrl: '', sparkles: true, snitch: true, frequency: 'session', delay: 3 },
  };
  const cfg = (all, kind) => ({ ...defaults[kind], ...((all && all[kind]) || {}) });
  const on = v => v === true || v === 'true';
  const href = u => { u = (u || '').trim(); return /^(https?:\/\/|mailto:|\/)/i.test(u) ? u : /^[\w-]+(\.[\w-]+)+([\/?#].*)?$/.test(u) ? 'https://' + u : ''; };
  const paras = t => String(t || '').split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };
  const sig = (k, c) => hash(k + '|' + [c.title, c.content, c.date, c.time, c.location, c.ctaText, c.ctaUrl].join('|'));

  // when to show: 'always' every landing-page load, 'session' once per browser visit, 'once' until the text is edited
  const shouldShow = (k, c) => {
    try {
      if (c.frequency === 'always') return true;
      if (c.frequency === 'once') return localStorage.getItem('bn-' + k) !== sig(k, c);
      return !sessionStorage.getItem('bn-' + k);
    } catch { return true; }
  };
  const markSeen = (k, c) => { try { if (c.frequency === 'once') localStorage.setItem('bn-' + k, sig(k, c)); else if (c.frequency !== 'always') sessionStorage.setItem('bn-' + k, '1'); } catch {} };

  // ── ticket helpers ──
  const dateParts = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return null; const dt = new Date(+m[1], +m[2] - 1, +m[3]); return { day: dt.getDate(), mon: dt.toLocaleDateString('en', { month: 'short' }), wk: dt.toLocaleDateString('en', { weekday: 'long' }), dt }; };
  const timeText = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); if (!m) return ''; const d = new Date(2000, 0, 1, +m[1], +m[2]); return d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }); };
  const downloadIcs = c => {
    const dp = dateParts(c.date); if (!dp) return;
    const [hh, mm] = /^\d{1,2}:\d{2}$/.test(c.time || '') ? c.time.split(':').map(Number) : [12, 0], pad = n => String(n).padStart(2, '0');
    const f = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const s = new Date(dp.dt.getFullYear(), dp.dt.getMonth(), dp.dt.getDate(), hh, mm), e = new Date(s.getTime() + 2 * 36e5), clean = x => String(x || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wand Atelier//EN', 'BEGIN:VEVENT', 'UID:' + Date.now() + '@wand-atelier', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(s), 'DTEND:' + f(e), 'SUMMARY:' + clean(c.title), 'LOCATION:' + clean(c.location), 'DESCRIPTION:' + clean(c.content), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'event.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  const owlFly = `<svg viewBox="0 0 120 90" class="bn-owl-svg" fill="currentColor" aria-hidden="true"><g class="wing wl"><path d="M44 40 C30 14 8 8 0 18 C14 20 24 30 40 52Z"/></g><g class="wing wr"><path d="M76 40 C90 14 112 8 120 18 C106 20 96 30 80 52Z"/></g>
    <ellipse cx="60" cy="52" rx="22" ry="26"/><circle cx="60" cy="30" r="15"/><path d="M48 20 L45 8 L55 15Z M72 20 L75 8 L65 15Z"/><circle cx="54" cy="29" r="5" fill="var(--bn-paper,#f3e4bd)"/><circle cx="66" cy="29" r="5" fill="var(--bn-paper,#f3e4bd)"/><circle cx="54" cy="29" r="2"/><circle cx="66" cy="29" r="2"/><path d="M60 32 L57 38 H63Z" fill="var(--bn-paper,#f3e4bd)"/>
    <rect x="42" y="66" width="36" height="16" rx="2" fill="var(--bn-paper,#f3e4bd)" stroke="currentColor" stroke-width="2" class="letter"/><path d="M42 66 L60 77 L78 66" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  const pinSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
  const clockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function markup(kind, c) {
    const link = href(c.ctaUrl), ext = /^https?:/i.test(link);
    const cta = c.ctaText && c.ctaText.trim() ? (link ? `<a class="bn-btn" href="${esc(link)}"${ext ? ' target="_blank" rel="noopener"' : ''} data-bn-cta>${esc(c.ctaText)}</a>` : `<button class="bn-btn" type="button" data-bn-close>${esc(c.ctaText)}</button>`) : '';
    if (kind === 'announcement') return `<div class="bn-backdrop"></div>${on(c.owl) ? `<div class="bn-owl">${owlFly}</div>` : ''}
      <div class="bn-card bn-ann" role="document"><button class="bn-close" type="button" aria-label="Close" data-bn-close>✕</button>
        <i class="bn-shadow"></i><i class="bn-roll top"></i><i class="bn-roll bot"></i>
        <div class="bn-paper"><span class="bn-orn tl"></span><span class="bn-orn tr"></span><span class="bn-orn bl"></span><span class="bn-orn br"></span>
          <div class="bn-kicker">${esc(c.kicker)}</div><h2 id="bnTitle">${esc(c.title)}</h2><div class="bn-rule"><span>✦</span></div>
          <div class="bn-body">${paras(c.content)}</div><div class="bn-actions">${cta}<button class="bn-later" type="button" data-bn-close>Maybe later</button></div></div>
        <div class="bn-seal">${icon(c.icon)}</div></div>`;
    const dp = dateParts(c.date), tt = timeText(c.time);
    const stars = Array.from({ length: 46 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 70).toFixed(1)}%;--s:${(1 + Math.random() * 2).toFixed(1)}px"></i>`).join('');
    const castle = icon('castle', 'bn-castle');
    return `<div class="bn-backdrop"></div>
      <div class="bn-card bn-evt" role="document"><button class="bn-close" type="button" aria-label="Close" data-bn-close>✕</button>
        <div class="bn-sky">${stars}</div><div class="bn-beam"></div>${castle}${on(c.snitch) ? `<div class="bn-snitch">${icon('snitch')}</div>` : ''}
        <div class="bn-evt-main"><div class="bn-badge">${icon(c.icon)}</div><div class="bn-kicker">${esc(c.kicker)}</div><h2 id="bnTitle">${esc(c.title)}</h2><div class="bn-body">${paras(c.content)}</div>
          ${dp || tt || c.location ? `<div class="bn-ticket">${dp ? `<div class="stub"><b>${dp.day}</b><span>${esc(dp.mon)}</span><em>${esc(dp.wk)}</em></div>` : ''}
            <div class="tinfo">${tt ? `<div>${clockSvg}<span>${esc(tt)}</span></div>` : ''}${c.location ? `<div>${pinSvg}<span>${esc(c.location)}</span></div>` : ''}</div></div>` : ''}
          <div class="bn-actions">${cta}${dp ? '<button class="bn-ghost" type="button" data-bn-ics>Add to calendar</button>' : ''}<button class="bn-later" type="button" data-bn-close>Maybe later</button></div></div></div>`;
  }

  let open = null;
  function show(kind, c, opts = {}) {
    if (open) open.close(true);
    const root = document.createElement('div'); root.className = 'bn-overlay bn-' + kind; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'bnTitle');
    root.innerHTML = markup(kind, c); document.body.appendChild(root);
    const prevFocus = document.activeElement, htmlOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, card = root.querySelector('.bn-card');
    const stopTicks = [];
    const ctx = gsap.context(() => { reduce ? simple(root) : kind === 'announcement' ? playAnnouncement(root, c) : playEvent(root, c, stopTicks); }, root);
    if (!reduce && on(c.sparkles)) sparkle(root, card, kind === 'event');
    if (!opts.preview) { try { track('banner', kind); } catch {} markSeen(kind, c); }
    let closed = false;
    const close = (instant) => {
      if (closed) return; closed = true; open = null; document.removeEventListener('keydown', onKey, true);
      const done = () => { stopTicks.forEach(f => f()); ctx.revert(); root.remove(); document.documentElement.style.overflow = htmlOverflow; try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch {} opts.onClose && opts.onClose(); };
      instant ? done() : gsap.to(root, { opacity: 0, duration: .4, ease: 'power2.in', onComplete: done });
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {                                                       // keep keyboard focus inside the dialog
        const f = [...root.querySelectorAll('a[href],button')].filter(x => x.offsetParent !== null); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-bn-close]') || e.target.classList.contains('bn-backdrop') || e.target === root) close();
      else if (e.target.closest('[data-bn-cta]') && !opts.preview) { try { track('bannerclick', kind); } catch {} }
      else if (e.target.closest('[data-bn-ics]')) downloadIcs(c);
    });
    open = { close };
    return { close };
  }

  const ready = root => { root.classList.add('ready'); root.querySelector('.bn-close')?.focus({ preventScroll: true }); };   // reveals the ✕ once the banner is fully open
  const simple = root => { ready(root); gsap.from(root, { opacity: 0, duration: .3 }); };

  // ── Announcement: an owl flies in, drops the letter, the scroll unrolls, the wax seal stamps ──
  function playAnnouncement(root, c) {
    const card = root.querySelector('.bn-card'), paper = root.querySelector('.bn-paper'), owl = root.querySelector('.bn-owl'), seal = root.querySelector('.bn-seal'), shadow = root.querySelector('.bn-shadow');
    const rollT = root.querySelector('.bn-roll.top'), rollB = root.querySelector('.bn-roll.bot'), W = innerWidth, h = card.offsetHeight;
    const items = paper.querySelectorAll('.bn-kicker, h2, .bn-rule, .bn-body p, .bn-actions > *');
    // start closed: the paper is fully hidden and the bottom roll rests on the top one, so all that falls from the owl is a single rolled scroll
    gsap.set(card, { opacity: 0, transformOrigin: '50% 0%' });                             // pivot at the roll: it is the part that falls
    gsap.set(paper, { clipPath: 'inset(0px 0px 100% 0px)', willChange: 'clip-path' });
    gsap.set(rollB, { y: -h }); gsap.set(shadow, { opacity: 0, scaleY: .02, transformOrigin: '50% 0%' });
    gsap.set(seal, { opacity: 0 }); gsap.set(items, { opacity: 0, y: 14 });
    const tl = gsap.timeline(), drop = owl ? 1.5 : 0, open = drop + .95, sweep = 1.4;
    tl.from(root.querySelector('.bn-backdrop'), { opacity: 0, duration: .6 });
    if (owl) {
      const flap = gsap.to(owl.querySelectorAll('.wing'), { scaleY: .3, transformOrigin: '50% 100%', duration: .16, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      const y0 = innerHeight * .2, cx = W / 2 - 60;
      gsap.set(owl, { x: -180, y: y0, opacity: 1 });
      tl.to(owl, { x: cx, duration: 1.5, ease: 'power1.out' }, .1);
      tl.to(owl, { y: y0 - 24, duration: .75, ease: 'sine.inOut', yoyo: true, repeat: 1 }, .1);                    // gentle bob on the way in
      tl.to(owl.querySelector('.letter'), { y: 60, opacity: 0, duration: .6, ease: 'power2.in' }, drop);              // the letter leaves the owl's claws
      tl.to(owl, { x: W + 200, y: y0 - 70, duration: 1.3, ease: 'power2.in', onComplete: () => flap.kill() }, drop + .2);
    }
    // 1. the closed scroll drops in
    tl.fromTo(card, { opacity: 0, y: -innerHeight * .3, scale: .35, rotation: -16 }, { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 1, ease: 'back.out(1.35)' }, drop);
    // 2. it unrolls downward: the paper is revealed from the top while the bottom roll travels down with its edge
    tl.to(paper, { clipPath: 'inset(0px 0px 0% 0px)', duration: sweep, ease: 'power2.inOut' }, open);
    tl.to(rollB, { y: 0, duration: sweep, ease: 'power2.inOut' }, open);
    tl.to(shadow, { scaleY: 1, opacity: 1, duration: sweep, ease: 'power2.inOut' }, open);
    tl.to(items, { opacity: 1, y: 0, duration: .55, stagger: .09, ease: 'power3.out' }, open + .35);               // the writing appears as the edge sweeps past
    tl.set(paper, { clearProps: 'clipPath,willChange' }, open + sweep + .05);                                       // no clip left behind once it is open
    // 3. the wax seal stamps the bottom edge, the scroll gives a little thud
    const land = open + sweep;
    tl.fromTo(seal, { opacity: 0, scale: 2.4, rotation: -30 }, { opacity: 1, scale: 1, rotation: -8, duration: .5, ease: 'power4.in' }, land);
    tl.fromTo(seal, { boxShadow: '0 0 0 0 rgba(150,20,30,.55)' }, { boxShadow: '0 0 0 30px rgba(150,20,30,0)', duration: .8, ease: 'power2.out' }, land + .5);
    tl.to(card, { y: '-=5', repeat: 1, yoyo: true, duration: .08, ease: 'power1.inOut' }, land + .5);
    tl.call(() => ready(root), null, land + 1);
    gsap.to(card, { y: -6, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: land + 1.4 });               // slow idle float
    gsap.to(seal, { rotation: -4, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: land + 1 });
  }

  // ── Event: light beam, rising ticket, flickering castle windows, a snitch looping through the sky ──
  function playEvent(root, c, stopTicks) {
    const card = root.querySelector('.bn-card'), stars = root.querySelectorAll('.bn-sky i'), beam = root.querySelector('.bn-beam'), castle = root.querySelector('.bn-castle'), snitch = root.querySelector('.bn-snitch');
    const tl = gsap.timeline();
    tl.from(root.querySelector('.bn-backdrop'), { opacity: 0, duration: .6 });
    tl.fromTo(beam, { opacity: 0, scaleY: .2 }, { opacity: 1, scaleY: 1, duration: 1.2, ease: 'power2.out', transformOrigin: '50% 100%' }, .1);
    tl.fromTo(card, { opacity: 0, y: 90, scale: .92 }, { opacity: 1, y: 0, scale: 1, duration: 1.1, ease: 'expo.out' }, .2);
    tl.from(castle, { y: 60, opacity: 0, duration: 1.1, ease: 'power3.out' }, .6);
    tl.from(card.querySelectorAll('.bn-badge, .bn-kicker, h2, .bn-body p, .bn-ticket, .bn-actions > *'), { y: 16, opacity: 0, duration: .6, stagger: .09, ease: 'power3.out' }, .9);
    const stub = card.querySelector('.bn-ticket .stub'); if (stub) tl.from(stub, { rotation: -6, scale: .8, duration: .7, ease: 'back.out(2)' }, 1.5);
    tl.call(() => ready(root), null, 1.9);
    gsap.to(stars, { opacity: () => .2 + Math.random() * .5, duration: () => .8 + Math.random() * 1.6, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: { each: .03, from: 'random' } });
    gsap.to(beam, { opacity: .65, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1.4 });
    gsap.to(castle, { y: -3, duration: 3.4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    if (snitch) {                                                                  // lissajous flight through the card, wings buzzing
      const wl = snitch.querySelectorAll('path'); gsap.to(wl, { scaleY: .55, transformOrigin: '50% 50%', duration: .07, repeat: -1, yoyo: true });
      const t0 = performance.now(); let px = 0, py = 0;
      const tick = () => { const w = card.clientWidth, h = card.clientHeight, t = (performance.now() - t0) / 1000;
        const x = w * (.5 + .42 * Math.sin(t * .8 + 1)), y = h * (.5 + .38 * Math.sin(t * 1.3));
        gsap.set(snitch, { x, y, rotation: Math.max(-25, Math.min(25, (x - px) * 4)), opacity: Math.min(1, t / 1.8) }); px = x; py = y; };
      gsap.ticker.add(tick); stopTicks.push(() => gsap.ticker.remove(tick));
    }
  }

  // drifting golden sparkles over the card (announcement) or around it (event)
  function sparkle(root, card, night) {
    const n = night ? 22 : 16, colors = night ? ['#ffe9a8', '#ffffff', '#d4a94f'] : ['#d4a94f', '#fff1c4', '#b8862b'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i'); s.className = 'bn-spark'; s.textContent = '✦'; s.style.color = colors[i % colors.length]; s.style.fontSize = (8 + Math.random() * 10) + 'px'; root.appendChild(s);
      const place = () => { const r = card.getBoundingClientRect(); gsap.set(s, { x: r.left - 20 + Math.random() * (r.width + 40), y: r.top - 10 + Math.random() * (r.height + 20), scale: .2, opacity: 0 }); };
      const run = () => { place(); gsap.to(s, { opacity: .95, scale: 1, duration: .6, ease: 'power2.out' }); gsap.to(s, { y: '-=' + (30 + Math.random() * 60), x: '+=' + (Math.random() * 30 - 15), opacity: 0, rotation: Math.random() * 180, duration: 1.8 + Math.random() * 1.4, delay: .5, ease: 'power1.in', onComplete: run }); };
      gsap.delayedCall(2 + i * .18, run);
    }
  }

  // landing page: after the hero intro, show the enabled banners one after another
  function autoStart(all) {
    const list = ['announcement', 'event'].map(k => ({ k, c: cfg(all, k) })).filter(x => on(x.c.enabled) && shouldShow(x.k, x.c));
    let i = 0;
    const next = () => { const it = list[i++]; if (!it) return; setTimeout(() => show(it.k, it.c, { onClose: () => setTimeout(next, 500) }), i === 1 ? Math.max(0, Number(it.c.delay) || 0) * 1000 : 200); };
    next();
  }

  return { show, autoStart, cfg, defaults, ICONS, icon, shouldShow };
})();
