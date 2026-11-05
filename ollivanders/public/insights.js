// Admin → Insights tab: turns /api/insights into KPI cards, charts, a sortable product table and plain-language tips.
// Written for a marketer / salesperson: what people love (hearts), what they ask about (contacts), where they come from, when they come.
function drawInsights(el, d, actions) {
  const sym = ((d.items.find(i => /[^\d.,\s]/.test(i.price)) || { price: '€' }).price.match(/[^\d.,\s]/) || ['€'])[0];
  const nf = n => Number(n || 0).toLocaleString('en'), money = n => sym + nf(Math.round(n));
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const maxOf = (list, f = x => x) => Math.max(1, ...list.map(f));

  // KPI cards
  const k = d.kpi, kpis = [
    ['Visitors', nf(k.visitors), 'unique browsers, last ' + d.days + ' days'], ['Page views', nf(k.pageviews), 'all pages'],
    ['Returning', k.returningPct + '%', 'came back on another day'], ['Wand views', nf(k.wandViews), 'wand detail pages opened'],
    ['Hearts', nf(k.hearts), nf(k.heartedVisitors) + ' people hearted'], ['Contact clicks', nf(k.contacts), 'asked about a wand'],
    ['Badge clicks', nf(k.badge), '“Fulfilled by” button'], ['Wishlist value', money(k.wishlistValue), 'price × hearts'],
    ['Lead value', money(k.pipelineValue), 'price × contact clicks'],
  ].map(([t, v, s]) => `<div class="kpi"><small>${t}</small><b>${v}</b><span>${s}</span></div>`).join('');

  // line / bar charts as inline SVG
  const W = 620, H = 180, L = 34, B = 26, T = 12, R = 10, n = d.series.length, X = i => L + i * (W - L - R) / (n - 1), plotH = H - B - T;
  const grid = (ymax) => [0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${T + plotH * (1 - f)}" y2="${T + plotH * (1 - f)}" class="g"/><text x="${L - 6}" y="${T + plotH * (1 - f) + 3}" text-anchor="end">${Math.round(ymax * f)}</text>`).join('');
  const xl = d.series.map((s, i) => i % 2 === 0 || i === n - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(s.label)}</text>` : '').join('');
  const line = (key, ymax) => d.series.map((s, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${(T + plotH * (1 - s[key] / ymax)).toFixed(1)}`).join('');
  const yv = maxOf(d.series, s => Math.max(s.pv, s.vis)), traffic = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Visitors and page views per day">${grid(yv)}${xl}
    <path d="${line('vis', yv)} L${X(n - 1)} ${T + plotH} L${X(0)} ${T + plotH}Z" class="area"/><path d="${line('pv', yv)}" class="ln2"/><path d="${line('vis', yv)}" class="ln1"/>
    ${d.series.map((s, i) => `<circle cx="${X(i)}" cy="${T + plotH * (1 - s.vis / yv)}" r="3.5" class="dot1"><title>${esc(s.label)}: ${s.vis} visitors, ${s.pv} page views</title></circle>`).join('')}</svg>`;
  const yh = maxOf(d.series, s => s.likes), bw = (W - L - R) / n * .62, heartsChart = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Hearts per day">${grid(yh)}${xl}
    ${d.series.map((s, i) => { const h = plotH * s.likes / yh; return `<rect x="${X(i) - bw / 2}" y="${T + plotH - h}" width="${bw}" height="${h}" rx="3" class="bar1"><title>${esc(s.label)}: ${s.likes} hearts, ${s.contacts} contact clicks</title></rect>`; }).join('')}</svg>`;

  // horizontal bar lists
  const bars = (list, cls = '', fmt = nf) => list.length ? list.map(r => `<div class="bar-row"><span class="bl" title="${esc(r.name)}">${esc(r.name)}</span><span class="bt"><i class="${cls}" style="width:${Math.max(2, r.n / maxOf(list, x => x.n) * 100)}%"></i></span><b>${fmt(r.n)}</b></div>`).join('') : '<p class="ins-note">No data yet.</p>';
  const topHearts = [...d.items].sort((a, b) => b.hearts - a.hearts).filter(i => i.hearts > 0).slice(0, 8).map(i => ({ name: (i.kind === 'wand' ? '' : '') + i.name, n: i.hearts, cls: i.kind }));
  const heartBars = topHearts.length ? topHearts.map(r => `<div class="bar-row"><span class="bl" title="${esc(r.name)}">${esc(r.name)}</span><span class="bt"><i class="${r.cls === 'wand' ? '' : 'alt'}" style="width:${Math.max(2, r.n / topHearts[0].n * 100)}%"></i></span><b>${nf(r.n)}</b></div>`).join('') : '<p class="ins-note">No hearts yet.</p>';

  // funnel + hours
  const f0 = d.funnel[0].n || 1, funnel = d.funnel.map((s, i) => `<div class="fn"><div class="fn-bar" style="width:${Math.max(3, s.n / f0 * 100)}%"><b>${nf(s.n)}</b></div><span>${s.label}${i ? ` · ${pct(s.n, d.funnel[i - 1].n)}% of previous` : ''}</span></div>`).join('');
  const hmax = maxOf(d.hours), hours = `<div class="hours">${d.hours.map((v, h) => `<div class="hr-col${h === d.peakHour && v ? ' peak' : ''}" title="${String(h).padStart(2, '0')}:00 — ${v} page views"><i style="height:${Math.max(2, v / hmax * 100)}%"></i>${h % 6 === 0 ? `<em>${String(h).padStart(2, '0')}</em>` : ''}</div>`).join('')}</div>`;

  // sortable product table
  let sortKey = 'score', dir = -1;
  const cols = [['name', 'Item'], ['cat', 'Type'], ['views', 'Views'], ['hearts', '♥'], ['heartRate', '♥ rate'], ['contacts', 'Contacts'], ['priceNum', 'Price'], ['value', 'Value'], ['score', 'Score']];
  const value = i => i.kind === 'wand' ? i.pipeline : i.wishlist;
  const rowsHtml = () => [...d.items].sort((a, b) => {
    const A = sortKey === 'value' ? value(a) : a[sortKey], Bv = sortKey === 'value' ? value(b) : b[sortKey];
    return (typeof A === 'string' ? A.localeCompare(Bv) : (A ?? -1) - (Bv ?? -1)) * dir;
  }).map(i => `<tr><td><span class="sw" style="background:${esc(safeColor(i.color))}"></span>${esc(i.name)}<small>${i.kind === 'wand' ? 'wand' : 'accessory'}</small></td><td>${esc(i.cat)}</td><td>${nf(i.views)}</td><td>${nf(i.hearts)}</td>
    <td>${i.heartRate === null ? '–' : i.heartRate + '%'}</td><td>${i.kind === 'wand' ? nf(i.contacts) : '–'}</td><td>${esc(i.price || '–')}</td><td title="${i.kind === 'wand' ? 'price × contact clicks' : 'price × hearts'}">${value(i) ? money(value(i)) : '–'}</td><td><b>${nf(i.score)}</b></td></tr>`).join('');
  const table = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(([k2, t]) => `<th><button data-sort="${k2}">${t}</button></th>`).join('')}</tr></thead><tbody>${rowsHtml()}</tbody></table></div>
    <p class="ins-note">Score = views + 3 × hearts + 8 × contact clicks. “Value” is lead value for wands (price × contact clicks) and wishlist value for accessories (price × hearts).</p>`;

  el.innerHTML = `
    <div class="ins-bar"><div>${d.hasDemo ? '<span class="tag demo">Sample data</span> These numbers are generated for preview, not real visitors.' : d.hasReal ? 'Live data from your visitors, last ' + d.days + ' days.' : 'No visits recorded yet.'}</div>
      <div class="ins-actions"><button class="btn" data-ins="refresh">Refresh</button><button class="btn" data-ins="demo">${d.hasDemo ? 'Regenerate sample data' : 'Generate sample data'}</button>${d.hasDemo ? '<button class="btn danger" data-ins="clear">Remove sample data</button>' : ''}</div></div>
    <div class="kpis">${kpis}</div>
    <div class="ins-grid">
      <section class="ins-card wide"><h3>Visitors & page views <span class="lg"><i class="l1"></i>visitors <i class="l2"></i>page views</span></h3>${traffic}</section>
      <section class="ins-card"><h3>Most loved <span class="lg"><i class="l1"></i>wands <i class="l3"></i>accessories</span></h3>${heartBars}</section>
      <section class="ins-card"><h3>Hearts per day</h3>${heartsChart}</section>
      <section class="ins-card wide"><h3>Product performance</h3>${table}</section>
      <section class="ins-card"><h3>Visitor journey</h3>${funnel}</section>
      <section class="ins-card"><h3>When people visit <small>server time${d.hours[d.peakHour] ? ', peak ' + String(d.peakHour).padStart(2, '0') + ':00' : ''}</small></h3>${hours}</section>
      <section class="ins-card"><h3>Where visitors come from</h3>${bars(d.sources)}<p class="ins-note">Tip: add <code>?ref=instagram</code> to a link you share to track that channel.</p></section>
      <section class="ins-card"><h3>Pages people open</h3>${bars(d.sections)}</section>
      <section class="ins-card"><h3>Devices</h3>${bars(d.devices)}<h3 style="margin-top:18px">Light or dark mode</h3>${bars(d.themes)}</section>
      <section class="ins-card"><h3>Banners</h3>${[['announcement', 'Announcement'], ['event', 'Event appearance']].map(([k2, name]) => { const b = (d.banners || {})[k2] || { views: 0, clicks: 0 }; return `<div class="bn-stat"><b>${name}</b><span>${nf(b.views)} seen</span><span>${nf(b.clicks)} clicks</span><span class="ctr">${pct(b.clicks, b.views)}% click rate</span></div>`; }).join('')}<p class="ins-note">Seen = opened over the landing page. A click is the banner's own button.</p></section>
      <section class="ins-card"><h3>Wand types browsed</h3>${bars(d.filters)}<p class="ins-note">Counts clicks on the Simple / Replicas / Template / Custom filters.</p></section>
      <section class="ins-card wide"><h3>What to do next</h3><ul class="tips">${d.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>
    </div>`;

  el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => {
    dir = sortKey === b.dataset.sort ? -dir : (b.dataset.sort === 'name' || b.dataset.sort === 'cat' ? 1 : -1); sortKey = b.dataset.sort;
    el.querySelector('.tbl tbody').innerHTML = rowsHtml();
  });
  el.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => actions[b.dataset.ins]());
}
