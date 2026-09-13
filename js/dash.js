/* Renders the audience page from data/audience.json. Inline SVG and HTML, no libraries. */
(async function () {
  // a where-request that arrives before the page has rendered is kept and answered once it has
  let pendingWhere = null, onWhere = null;
  if (window.parent !== window) addEventListener('message', e => { if (e.data && e.data.type === 'sd-audience-where') { if (onWhere) onWhere(e); else pendingWhere = e; } });
  const D = await fetch('data/audience.json', { cache: 'no-store' }).then(r => r.json());
  const WORLD = await fetch('data/world.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  const fmt = new Intl.NumberFormat('en-GB');
  const n = v => fmt.format(Math.round(v));
  const pc = v => v > 0 && v < 0.1 ? '<0.1%' : (Math.round(v * 10) / 10).toFixed(1) + '%';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const T = iso => new Date(iso + 'T00:00:00').getTime();
  const dm = iso => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = sel => document.querySelector(sel);
  // the browser can drop a smooth scroll in the first seconds after a load, so if nothing moved, go there directly
  const scrollPage = to => { const y0 = scrollY, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; window.scrollTo({ top: to, behavior: reduced ? 'auto' : 'smooth' }); if (!reduced) setTimeout(() => { if (Math.abs(scrollY - y0) < 2 && Math.abs(to - y0) > 2) window.scrollTo({ top: to, behavior: 'auto' }); }, 240); };
  const EMBEDDED = window.parent !== window && !new URLSearchParams(location.search).has('standalone');
  const NS = 'http://www.w3.org/2000/svg';
  const el = (parent, tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; parent.appendChild(e); return e; };
  const niceMax = v => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); const m = v / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => m <= s) || 10) * p; };
  const width = host => Math.max(280, Math.floor(host.getBoundingClientRect().width || 280));
  const short = v => v >= 1000 ? (v / 1000).toString().replace(/\.0$/, '') + 'K' : String(v);

  function table(card, caption, head, rows, visible) {
    const wasOpen = card.querySelector('details.tbl')?.open;
    card.querySelectorAll('table.vh, details.tbl').forEach(x => x.remove());
    const html = `<table${visible ? '' : ' class="vh"'}><caption>${esc(caption)}</caption><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${typeof c === 'number' ? n(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    if (visible) { const d = document.createElement('details'); d.className = 'tbl'; if (wasOpen) d.open = true; d.innerHTML = `<summary>Show the data</summary><div class="scroll">${html}</div>`; card.appendChild(d); }
    else card.insertAdjacentHTML('beforeend', html);
  }

  const PHONE = () => matchMedia('(max-width: 640px)').matches;
  // fold a long list on a phone: the first rows stay, the tail opens on a chevron
  function fold(container, keep) {
    if (!PHONE() || !container) return;
    const rows = [...container.querySelectorAll('li')].filter(li => !li.classList.contains('heads') && !li.classList.contains('sep'));
    if (rows.length <= keep + 3) return;
    rows.slice(keep).forEach(li => li.classList.add('tail'));
    container.classList.add('trunc');
    const b = document.createElement('button');
    const label = open => { b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', open ? 'Show fewer rows' : 'Show all rows'); };
    b.type = 'button'; b.className = 'more'; label(false);
    b.innerHTML = `<span class="cnt">+${rows.length - keep}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    b.addEventListener('click', () => { const open = container.classList.toggle('open'); label(open); if (!open) container.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    container.insertAdjacentElement('afterend', b);
  }
  // list of label, bar, value. Bars start at a common left edge. scale: 100 for shares, or the largest value for rankings.
  function list(host, rows, opts = {}) {
    const scale = opts.scale === 'max' ? Math.max(...rows.filter(r => !r.sep).map(r => r.v), 1e-9) : 100;
    const nums = rows.some(r => r.count !== undefined);
    host.innerHTML = `<ul class="list${opts.small ? ' small' : ''}${opts.cols ? ' cols' : ''}${opts.tight ? ' tight' : ''}${nums ? ' nums' : ''}${opts.rank ? ' ranked' : ''}">${rows.map((r, i) => r.sep ? '<li class="sep" aria-hidden="true"></li>' :
      `<li class="${r.muted ? 'muted' : ''}" style="--i:${Math.min(i, 30)}">${opts.rank && !r.muted ? `<span class="rk">${i + 1}</span>` : ''}<span class="n">${esc(r.label)}</span><span class="t"><span class="f${r.v > 0 ? ' nz' : ''}" style="--w:${Math.max(0, Math.min(100, r.v / scale * 100)).toFixed(2)}%"></span></span>${nums ? `<span class="c">${r.count === undefined ? '' : (r.est ? '≈ ' : '') + n(r.count)}</span>` : ''}<span class="v">${r.text}</span></li>`).join('')}</ul>`;
  }

  // daily chart: an area for the total, and optionally a second line for one component
  function daily(host, series, opts = {}) {
    host.innerHTML = '';
    if (series.length < 2) return;
    const W = width(host), H = opts.h || 200, m = { l: 46, r: 12, t: 12, b: 26 };
    const s = el(document.createDocumentFragment(), 'svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.label || '' });
    const total = opts.total || 'count', part = opts.part;
    const t0 = T(series[0].date), t1 = T(series[series.length - 1].date);
    const ymax = niceMax(Math.max(1, ...series.map(r => r[total] || 0)) * 1.05);
    const x = t => m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r), y = v => H - m.b - v / ymax * (H - m.t - m.b);
    for (let i = 0; i <= 4; i++) { const v = ymax / 4 * i; el(s, 'line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i ? 'grid' : 'base' }); el(s, 'text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, short(v)); }
    let d = new Date(series[0].date + 'T00:00:00'); d.setDate(1); d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= t1) { el(s, 'text', { x: x(d.getTime()), y: H - 8, 'text-anchor': 'middle' }, MON[d.getMonth()] + (d.getMonth() === 0 && W >= 480 ? ' ' + String(d.getFullYear()).slice(2) : '')); d.setMonth(d.getMonth() + 1); }
    const path = key => series.map((r, i) => (i ? 'L' : 'M') + x(T(r.date)).toFixed(1) + ',' + y(r[key] || 0).toFixed(1)).join('');
    el(s, 'path', { d: path(total) + `L${x(t1).toFixed(1)},${y(0).toFixed(1)}L${x(t0).toFixed(1)},${y(0).toFixed(1)}Z`, class: 'area' + (part ? ' b' : '') });
    el(s, 'path', { d: path(total), class: 'line' + (part ? ' b' : '') });
    if (part) el(s, 'path', { d: path(part), class: 'line' });
    const lastR = series[series.length - 1], lx = x(t1), ly = y(lastR[total] || 0);
    el(s, 'circle', { cx: lx, cy: ly, r: 3, class: 'end-dot' });
    if ((lastR[total] || 0) > 0) el(s, 'text', { x: lx - 8, y: Math.max(m.t + 10, ly - 10), 'text-anchor': 'end', class: 'end-val' }, n(lastR[total]));
    host.appendChild(s);
  }

  // monthly columns with an optional second label line
  function columns(host, rows, opts = {}) {
    host.innerHTML = '';
    // on a phone the columns render wider than the card and the card scrolls sideways, so every month keeps a readable label
    // narrow columns at any width: the chart renders wider than the card and the card scrolls sideways
    const hostW = width(host), W = hostW / rows.length < 52 ? Math.max(hostW, rows.length * 56) : hostW, H = opts.h || 200, m = { l: 4, r: 4, t: 24, b: 38 };
    const s = el(document.createDocumentFragment(), 'svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.label || '' });
    const max = Math.max(1, ...rows.map(r => r.count)), slot = Math.min(168, (W - m.l - m.r) / rows.length), bw = Math.min(96, slot * .72), x0 = m.l + (W - m.l - m.r - slot * rows.length) / 2;
    const y = v => H - m.b - v / max * (H - m.t - m.b);
    el(s, 'line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'base' });
    rows.forEach((r, i) => {
      const xx = x0 + (i + .5) * slot - bw / 2, note = opts.note ? opts.note(r) : '';
      el(s, 'rect', { x: xx, y: y(r.count), width: bw, height: Math.max(0, y(0) - y(r.count)), rx: 2, class: 'col' + (note ? ' part' : '') });
      el(s, 'text', { x: xx + bw / 2, y: y(r.count) - 6, 'text-anchor': 'middle', class: 'val' }, n(r.count));
      if (slot < 44) {
        el(s, 'text', { x: xx + bw / 2, y: H - 25, 'text-anchor': 'middle' }, MON[+r.month.slice(5) - 1]);
        el(s, 'text', { x: xx + bw / 2, y: H - 13, 'text-anchor': 'middle', class: 'yy' }, r.month.slice(2, 4));
        if (note) el(s, 'text', { x: i === 0 ? Math.max(0, xx - 6) : i === rows.length - 1 ? Math.min(W, xx + bw + 6) : xx + bw / 2, y: H - 2, 'text-anchor': i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle', class: 'note' }, note);
      } else {
        el(s, 'text', { x: xx + bw / 2, y: H - 22, 'text-anchor': 'middle' }, MON[+r.month.slice(5) - 1] + (slot < 90 ? ' ' + r.month.slice(2, 4) : ' ' + r.month.slice(0, 4)));
        if (note) el(s, 'text', { x: xx + bw / 2, y: H - 7, 'text-anchor': 'middle', class: 'note' }, note);
      }
    });
    if (W > hostW) { s.style.width = W + 'px'; s.style.maxWidth = 'none'; host.classList.add('wide'); } else host.classList.remove('wide');
    host.appendChild(s);
  }

  const V = D.video, A = D.audio;
  const vPeriod = `${dm(V.period_start)} to ${dm(V.period_end)}`, aPeriod = `${dm(A.period_start)} to ${dm(A.period_end)}`;
  const kpi = (l, v, s) => `<div class="kpi"><p class="l">${l}</p><p class="v">${v}</p><p class="s">${s}</p></div>`;
  const dayOf = iso => +iso.slice(8);
  const monthNote = (r, start, end) => r.month === start.slice(0, 7) && dayOf(start) > 1 ? `from ${dayOf(start)} ${MON[+start.slice(5, 7) - 1]}` : r.month === end.slice(0, 7) ? `to ${dayOf(end)} ${MON[+end.slice(5, 7) - 1]}` : '';

  function renderVideo() {
    const tot = V.total_views;
    $('#v-summary').innerHTML = kpi('Views', n(tot), vPeriod) + kpi('Subscribers', n(V.subscribers), `on ${dm(V.subscribers_as_of)}`);

    list($('#v-geo'), V.geography.map(g => ({ label: g.name, v: g.views / tot * 100, count: g.views, text: pc(g.views / tot * 100) })), { small: true, cols: true, scale: 'max', rank: true });
    fold($('#v-geo .list'), 10);
    table($('#v-geo-card'), 'Views by country', ['Country', 'Views', 'Share %'], V.geography.map(g => [g.name, g.views, (g.views / tot * 100).toFixed(2)]));

    const male = V.age_gender.reduce((a, b) => a + b.male_pct, 0), female = V.age_gender.reduce((a, b) => a + b.female_pct, 0);
    const est = p => Math.round(p / 100 * tot / 100) * 100;
    list($('#v-age'), [{ label: 'Male', v: male, count: est(male), est: true, text: pc(male) }, { label: 'Female', v: female, count: est(female), est: true, text: pc(female) }, { sep: true }]
      .concat(V.age_gender.map(b => ({ label: b.band + ' years', v: b.male_pct + b.female_pct, count: est(b.male_pct + b.female_pct), est: true, text: pc(b.male_pct + b.female_pct) }))));
    $('#v-age-card').querySelectorAll('.foot').forEach(x => x.remove());
    $('#v-age-card').insertAdjacentHTML('beforeend', `<p class="foot">Counts marked ≈ are the share applied to all ${n(tot)} views, rounded to the nearest hundred.</p>`);
    table($('#v-age-card'), 'Share of views by gender and age', ['Group', 'Share %'], [['Male', male.toFixed(2)], ['Female', female.toFixed(2)]].concat(V.age_gender.map(b => [b.band, (b.male_pct + b.female_pct).toFixed(2)])));

    list($('#v-dev'), V.devices.map(d => ({ label: d.name, v: d.views / tot * 100, count: d.views, text: pc(d.views / tot * 100) })).concat([{ sep: true }, { label: 'Not reported', v: V.devices_other / tot * 100, count: V.devices_other, text: pc(V.devices_other / tot * 100), muted: true }]));
    table($('#v-dev-card'), 'Views by device type', ['Device', 'Views'], V.devices.map(d => [d.name, d.views]).concat([['Not reported', V.devices_other]]));

    $('#v-daily-p').innerHTML = `Views per day · <b>${vPeriod}</b>`;
    daily($('#v-daily'), V.daily, { label: 'Views per day', h: 230 });
    $('#v-daily-foot').innerHTML = `YouTube's totals table reports <b>${n(tot)}</b> views; its daily table sums to ${n(V.daily_series_sum)}.`;
    table($('#v-daily-card'), 'Views per day', ['Date', 'Views'], V.daily.map(r => [r.date, r.count]));

    list($('#v-cc'), V.captions.map(c => ({ label: c.name, v: c.views / tot * 100, count: c.views, text: pc(c.views / tot * 100) })).concat([{ sep: true }, { label: 'Not reported', v: V.captions_other / tot * 100, count: V.captions_other, text: pc(V.captions_other / tot * 100), muted: true }]), { small: true, tight: true });
    fold($('#v-cc .list'), 8);
    table($('#v-cc-card'), 'Views by subtitle language', ['Captions', 'Views'], V.captions.map(c => [c.name, c.views]).concat([['Not reported', V.captions_other]]));

    columns($('#v-month'), V.monthly, { label: 'Views per month', h: 269, note: r => monthNote(r, V.period_start, V.period_end) });
    table($('#v-month-card'), 'Views by month', ['Month', 'Views'], V.monthly.map(r => [r.month, r.count]));

    $('#v-sub-p').innerHTML = `Subscribers · <b>${vPeriod}</b>`;
    daily($('#v-sub'), V.subscriber_series.map(r => ({ date: r.date, count: r.subscribers })), { label: 'Subscribers over time', h: 216 });
    table($('#v-sub-card'), 'Subscribers by day', ['Date', 'Subscribers'], V.subscriber_series.map(r => [r.date, r.subscribers]));
  }

  function renderAudio() {
    const tot = A.total_plays_downloads, P = A.audience_page;
    $('#a-summary').innerHTML = kpi('Plays and downloads', n(tot), aPeriod) + kpi('On Spotify', n(A.spotify_plays), pc(A.spotify_plays / tot * 100) + ' of the total') + kpi('Downloads in other apps', n(A.other_downloads), pc(A.other_downloads / tot * 100) + ' of the total, via the RSS feed');

    list($('#a-geo'), A.geography_pct.map(g => ({ label: g.name, v: g.pct, text: pc(g.pct) })), { small: true, cols: true, scale: 'max', rank: true });
    fold($('#a-geo .list'), 10);
    table($('#a-geo-card'), 'Audio by country', ['Country', 'Share %'], A.geography_pct.map(g => [g.name, g.pct.toFixed(2)]));

    $('#a-age-p').innerHTML = `Spotify listeners, all time · Spotify audience page`;
    list($('#a-age'), P.gender.filter(g => g.pct > 0).map(g => ({ label: g.label, v: g.pct, text: pc(g.pct) })).concat([{ sep: true }]).concat(P.age.filter(b => b.band !== 'Unknown').map(b => ({ label: b.band + ' years', v: b.pct, text: pc(b.pct) }))));
    table($('#a-age-card'), 'Spotify listeners by gender and age', ['Group', 'Share %'], P.gender.map(g => [g.label, g.pct]).concat(P.age.map(b => [b.band, b.pct])));

    $('#a-apps-p').innerHTML = `All platforms, all time · Spotify audience page`;
    list($('#a-apps'), P.apps.map(a => ({ label: a.name, v: a.pct, text: pc(a.pct) })));
    table($('#a-apps-card'), 'Listening apps', ['App', 'Share %'], P.apps.map(a => [a.name, a.pct]));
    if (P.devices) { $('#a-dev-card').hidden = false; $('#a-dev-p').innerHTML = `All platforms, all time · Spotify audience page`; list($('#a-dev'), P.devices.map(a => ({ label: a.name, v: a.pct, text: pc(a.pct) }))); table($('#a-dev-card'), 'Devices', ['Device', 'Share %'], P.devices.map(a => [a.name, a.pct])); }

    $('#a-daily-p').innerHTML = `Per day · <b>${aPeriod}</b>`;
    const split = A.daily_split.map(r => ({ date: r.date, total: r.spotify + r.other, spotify: r.spotify }));
    daily($('#a-daily'), split, { total: 'total', part: 'spotify', label: 'Plays and downloads per day, all platforms, with Spotify plays as a second line', h: 190 });
    $('#a-daily-legend').innerHTML = `<span><i style="background:var(--ink-mute)"></i>Plays and downloads, all platforms <b>${n(tot)}</b></span><span><i style="background:var(--crimson)"></i>Of which plays on Spotify <b>${n(A.spotify_plays)}</b></span>`;
    table($('#a-daily-card'), 'Plays and downloads per day', ['Date', 'All platforms', 'On Spotify'], split.map(r => [r.date, r.total, r.spotify]));

  }

  function renderWebsite() {
    const Wb = D.website; if (!Wb) return;
    const tot = Wb.total_impressions, per = `${dm(Wb.period_start)} to ${dm(Wb.period_end)}`;
    $('#w-summary').innerHTML = kpi('Impressions in Google Search', n(tot), `${per} · the export's ${Wb.window.toLowerCase()} window`);
    list($('#w-geo'), Wb.countries.map(g => ({ label: g.name, v: g.impressions / tot * 100, text: pc(g.impressions / tot * 100) })), { small: true, cols: true, scale: 'max', rank: true });
    fold($('#w-geo .list'), 10);
    table($('#w-geo-card'), 'Impressions by country', ['Country', 'Impressions', 'Share %'], Wb.countries.map(g => [g.name, g.impressions, (g.impressions / tot * 100).toFixed(2)]));
    list($('#w-dev'), Wb.devices.map(d => ({ label: d.name, v: d.impressions / tot * 100, text: pc(d.impressions / tot * 100) })));
    table($('#w-dev-card'), 'Impressions by device', ['Device', 'Impressions'], Wb.devices.map(d => [d.name, d.impressions]));
    columns($('#w-month'), Wb.monthly, { label: 'Impressions per month', h: 176, note: r => monthNote(r, Wb.period_start, Wb.period_end) });
    table($('#w-month-card'), 'Impressions by month', ['Month', 'Impressions'], Wb.monthly.map(r => [r.month, r.count]));
  }

  function renderAll() {
    const Wb = D.website, P = A.audience_page;
    const vt = V.total_views, at = A.total_plays_downloads, wt = Wb ? Wb.total_impressions : 0, all = vt + at + wt;
    const wPeriod = Wb ? `${dm(Wb.period_start)} to ${dm(Wb.period_end)}` : '';
    const kp = (cls, l, v, sub) => kpi(l, v, sub).replace('class="kpi"', 'class="kpi ' + cls + '"');
    $('#t-summary').innerHTML = `<div class="kpi hero"><p class="l">Total listeners and viewers</p><p class="v">${n(all)}</p></div><div class="kpi"><p class="l">Countries reached</p><p class="v">${n(new Set(V.geography.map(g => g.name).concat(A.geography_pct.map(g => g.name), Wb ? Wb.countries.map(g => g.name) : [])).size)}</p></div>` + kp('pv', 'YouTube views', n(vt), vPeriod) + kp('pa', 'Podcast plays and downloads', n(at), aPeriod) + (Wb ? kp('pw', 'Google Search impressions', n(wt), wPeriod) : '');

    // reach: a donut of the three totals, true to scale
    const parts = [{ k: 'pv', name: 'Video', v: vt, c: 'var(--cobalt)' }, { k: 'pa', name: 'Audio', v: at, c: 'var(--crimson)' }].concat(Wb ? [{ k: 'pw', name: 'Website', v: wt, c: 'var(--forest)' }] : []);
    const host = $('#t-share'); host.innerHTML = '';
    const S = 220, cx = S / 2, cy = S / 2, r = 84, sw = 26, C = 2 * Math.PI * r;
    const svg = el(document.createDocumentFragment(), 'svg', { viewBox: `0 0 ${S} ${S}`, class: 'donut', role: 'img', 'aria-label': 'All counts by platform' });
    let off = 0;
    parts.forEach(p => { const len = p.v / all * C; el(svg, 'circle', { cx, cy, r, fill: 'none', stroke: p.c, 'stroke-width': sw, 'stroke-dasharray': `${len.toFixed(3)} ${(C - len).toFixed(3)}`, 'stroke-dashoffset': (-off).toFixed(3), transform: `rotate(-90 ${cx} ${cy})` }); off += len; });
    el(svg, 'text', { x: cx, y: cy + 10, 'text-anchor': 'middle', class: 'donut-v' }, n(all));
    host.appendChild(svg);
    host.insertAdjacentHTML('beforeend', `<ul class="list leg">${parts.map((p, i) => `<li style="--i:${i}"><i style="background:${p.c}"></i><span class="n">${p.name}</span><span class="c">${n(p.v)}</span><span class="v">${pc(p.v / all * 100)}</span></li>`).join('')}</ul>`);
    table($('#t-share-card'), 'Total by platform', ['Platform', 'Count', 'Share %'], parts.map(p => [p.name, p.v, (p.v / all * 100).toFixed(2)]));

    // gender: video share of views beside audio share of Spotify listeners
    const male = V.age_gender.reduce((a, b) => a + b.male_pct, 0), female = V.age_gender.reduce((a, b) => a + b.female_pct, 0);
    const ag = k => (P.gender.find(g => g.label === k) || { pct: null }).pct;
    const grows = [{ label: 'Male', v: male, a: ag('Male') }, { label: 'Female', v: female, a: ag('Female') }].concat(P.gender.filter(g => !['Male', 'Female'].includes(g.label) && g.pct > 0).map(g => ({ label: g.label, v: null, a: g.pct })));
    const bar = (k, v) => v === null ? '<span class="t none"></span>' : `<span class="t"><span class="f ${k}${v > 0 ? ' nz' : ''}" style="--w:${Math.min(100, v).toFixed(2)}%"></span></span>`;
    $('#t-gender').innerHTML = `<ul class="list two"><li class="heads"><span></span><span></span><span class="pv">Video</span><span class="pa">Audio</span></li>${grows.map((g, i) => `<li style="--i:${i}"><span class="n">${esc(g.label)}</span><span class="tt">${bar('pv', g.v)}${bar('pa', g.a)}</span><span class="v pv">${g.v === null ? '' : pc(g.v)}</span><span class="v pa">${g.a === null ? '' : pc(g.a)}</span></li>`).join('')}</ul>`;
    table($('#t-gender-card'), 'Gender by platform', ['Group', 'Video share of views %', 'Audio share of Spotify listeners %'], grows.map(g => [g.label, g.v === null ? '' : g.v.toFixed(2), g.a === null ? '' : g.a.toFixed(2)]));

    // age: Spotify's bands spread evenly by year onto YouTube's bands, and a total for each band
    const span = band => { const lo = parseInt(band, 10); const hi = band.includes('+') ? 120 : parseInt(band.split(' to ')[1], 10); return [lo, hi]; };
    const SPOT = { '0 to 17': [13, 17], '18 to 22': [18, 22], '23 to 27': [23, 27], '28 to 34': [28, 34], '35 to 44': [35, 44], '45 to 59': [45, 59], '60+': [60, 74] };
    const bands = V.age_gender.map(b => ({ band: b.band, lo: span(b.band)[0], hi: span(b.band)[1], v: b.male_pct + b.female_pct, a: 0 }));
    P.age.forEach(b => { const sp = SPOT[b.band]; if (!sp) return; const yrs = sp[1] - sp[0] + 1; for (let y = sp[0]; y <= sp[1]; y++) { const t = bands.find(x => y >= x.lo && y <= x.hi); if (t) t.a += b.pct / yrs; } });
    bands.forEach(b => { b.total = Math.round(b.v / 100 * vt) + Math.round(b.a / 100 * A.spotify_plays); });
    const tmax = Math.max(...bands.map(b => b.total));
    $('#t-age').innerHTML = `<ul class="list tri tot"><li class="heads"><span></span><span class="pt">Total</span><span class="pv">Video</span><span class="pa">Audio</span></li>${bands.map((b, i) => `<li style="--i:${i}"><span class="n">${esc(b.band)} years</span><span class="tc"><span class="t"><span class="f nz" style="--w:${(b.total / tmax * 100).toFixed(2)}%"></span></span><span class="c">≈ ${n(b.total)}</span></span><span class="v pv">${pc(b.v)}</span><span class="v pa">≈ ${pc(b.a)}</span></li>`).join('')}</ul>`;
    table($('#t-age-card'), 'Age by platform', ['Band', 'Total, estimate', 'Video share of views %', 'Audio share of Spotify listeners recast onto YouTube bands %'], bands.map(b => [b.band, b.total, b.v.toFixed(2), b.a.toFixed(2)]));

    // countries: one row per country, three shares on one shared scale
    const m = new Map(); const put = (name, k, v) => { if (!m.has(name)) m.set(name, { name, v: null, a: null, w: null }); m.get(name)[k] = v; };
    V.geography.forEach(g => put(g.name, 'v', g.views / vt * 100));
    A.geography_pct.forEach(g => put(g.name, 'a', g.pct));
    const top = r => Math.max(r.v ?? -1, r.a ?? -1);
    // a country YouTube left out of its table can hold at most one view fewer than the smallest country it listed
    const unlisted = Math.max(0, Math.min(...V.geography.map(g => g.views)) - 1);
    const rows = [...m.values()].map(r => { const vc = r.v === null ? unlisted : Math.round(r.v / 100 * vt), ac = r.a === null ? 0 : Math.ceil(r.a / 100 * at - 1e-9); return { ...r, vc, ac, total: vc + ac }; })
      .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
    rows.forEach((r, i) => { r.id = i; });
    const scale = Math.max(...rows.flatMap(r => [r.v, r.a]).filter(x => x !== null));
    const half = Math.ceil(rows.length / 2);
    const row = r => `<li id="t-c-${r.id}" data-pin="${r.id}" style="--i:${Math.min(r.id % half, 30)}"><span class="rk">${r.id + 1}</span><span class="n">${esc(r.name)}</span><span class="c">${r.a === null && r.v !== null ? '' : '≈ '}${n(r.total)}</span><span class="v pv">${r.v === null ? '' : pc(r.v)}</span><span class="v pa">${r.a === null ? '' : pc(r.a)}</span></li>`;
    const block = rs => `<ul class="list tri num"><li class="heads"><span></span><span class="pt">Total</span><span class="pv">Video</span><span class="pa">Audio</span></li>${rs.map(row).join('')}</ul>`;
    // the map: a globe outline and graticule as the ground, land in the Equal Earth projection, one pin per country
    let map = '';
    if (WORLD) {
      const R = v => v === null ? 0 : 2.4 + 13 * Math.sqrt(v / scale);
      const pins = rows.filter(r => WORLD.pins[r.name]).map(r => { const [x, y] = WORLD.pins[r.name]; const t = esc(r.name) + ' · ' + (r.a === null && r.v !== null ? '' : '≈ ') + n(r.total) + (r.v !== null ? ' · Video ' + pc(r.v) : '') + (r.a !== null ? ' · Audio ' + pc(r.a) : '');
        return `<g class="pin" id="t-p-${r.id}" data-row="${r.id}" tabindex="0" role="button" aria-label="${t}" transform="translate(${x} ${y})"><title>${t}</title>${r.v !== null ? `<circle class="pv" r="${R(r.v).toFixed(1)}"/>` : ''}${r.a !== null ? `<circle class="halo" r="${R(r.a).toFixed(1)}"/><circle class="pa" r="${R(r.a).toFixed(1)}"/>` : ''}<circle class="core" r="1.6"/></g>`; });
      map = `<div class="mapwrap"><svg class="map" viewBox="0 0 ${WORLD.w} ${WORLD.h}" role="img" aria-label="World map with a pin for every country that watches or listens; a pin opens its row in the list"><defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFDF7" stop-opacity=".9"/><stop offset="1" stop-color="#EEF0FA" stop-opacity=".95"/></linearGradient><linearGradient id="landg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FA3E3"/><stop offset=".5" stop-color="#A58FD1"/><stop offset="1" stop-color="#D39AB1"/></linearGradient></defs><path class="sea" d="${WORLD.frame}" fill="url(#sea)"/><path class="grat" d="${WORLD.grat}"/><path class="land" d="${WORLD.land}" fill="url(#landg)"/>${pins.join('')}</svg></div>
      <div class="maplegend"><span><i class="dot"></i>Video</span><span><i class="ring"></i>Audio</span></div>`;
    }
    $('#t-geo').innerHTML = `${map}<div class="twin">${block(rows.slice(0, half))}${block(rows.slice(half))}</div>`;
    // on a phone the strip opens on the Americas to India span, the two leading countries both in view
    fold($('#t-geo .twin'), 10);
    const mw = $('#t-geo .mapwrap'); if (mw && matchMedia('(max-width: 640px)').matches) mw.scrollLeft = Math.round(mw.scrollWidth * 0.2);
    const card = $('#t-geo-card');
    if (!card.dataset.wired) {
      card.dataset.wired = '1';
      const go = id => { const li = document.getElementById('t-c-' + id); if (!li) return; const tr = li.closest('.trunc'); if (tr && !tr.classList.contains('open')) { tr.classList.add('open'); const mb = tr.nextElementSibling; if (mb && mb.classList.contains('more')) { mb.setAttribute('aria-expanded', 'true'); mb.setAttribute('aria-label', 'Show fewer rows'); } } card.querySelectorAll('li.hit').forEach(x => x.classList.remove('hit')); li.classList.add('hit'); if (EMBEDDED) { const r = li.getBoundingClientRect(); parent.postMessage({ type: 'sd-audience-scroll', top: r.top + scrollY, height: r.height }, '*'); } else scrollPage(Math.max(0, li.getBoundingClientRect().top + scrollY - Math.max(0, (innerHeight - li.getBoundingClientRect().height) / 2))); clearTimeout(li._t); li._t = setTimeout(() => li.classList.remove('hit'), 2800); };
      card.addEventListener('click', e => { const p = e.target.closest('.pin'); if (p) go(p.dataset.row); });
      card.addEventListener('keydown', e => { const p = e.target.closest('.pin'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(p.dataset.row); } });
      const pinOf = e => { const li = e.target.closest('li[data-pin]'); return li ? document.getElementById('t-p-' + li.dataset.pin) : null; };
      card.addEventListener('mouseover', e => { const g = pinOf(e); if (g) g.classList.add('on'); });
      card.addEventListener('mouseout', e => { const g = pinOf(e); if (g) g.classList.remove('on'); });
    }
    table($('#t-geo-card'), 'Countries by platform', ['Country', 'Total', 'Video views (countries YouTube did not list: the most they could hold)', 'Audio plays and downloads, estimate rounded up', 'Video share of views %', 'Audio share of plays and downloads %'], rows.map(r => [r.name, r.total, r.vc, r.ac, r.v === null ? '' : r.v.toFixed(2), r.a === null ? '' : r.a.toFixed(2)]));
  }

  $('#brand-sub').textContent = `The Sector Debrief · updated ${dm(D.sources[0].exported_at).replace(' Sep ', ' September ')} · updated quarterly`;

  const rendered = {};
  const RENDER = { all: renderAll, video: renderVideo, audio: renderAudio, website: renderWebsite };
  const viewOf = hash => ['video', 'audio', 'website'].includes(hash.slice(1)) ? hash.slice(1) : 'all';
  function show(view) {
    document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.view === view; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === view));
    document.body.dataset.view = view;
    if (!rendered[view]) { RENDER[view](); rendered[view] = true; }
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
  $('.tabs').addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const tabs = [...document.querySelectorAll('.tab:not([hidden])')]; const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'); const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.view; show(next); document.querySelector(`.tab[data-view="${next}"]`).focus(); e.preventDefault(); });
  addEventListener('hashchange', () => show(viewOf(location.hash)));
  let rt, lastW = innerWidth; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (innerWidth === lastW) return; lastW = innerWidth; for (const v in rendered) { const p = document.getElementById(v); p.classList.add('settled'); if (p.classList.contains('active')) RENDER[v](); else rendered[v] = false; } }, 150); });
  addEventListener('beforeprint', () => { document.querySelectorAll('.panel').forEach(p => p.classList.add('active')); for (const v in RENDER) { RENDER[v](); rendered[v] = true; } });
  addEventListener('afterprint', () => show(viewOf(location.hash)));
  if (!D.website) document.querySelector('.tab[data-view="website"]').hidden = true;
  show(viewOf(location.hash));
  // an embedded frame reports its height to the host; the report goes out before any position reply, so the host can scroll within the full height
  const report = () => { if (EMBEDDED) parent.postMessage({ type: 'sd-audience-height', height: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); };
  // once the visitor has picked a tab or scrolled, a late where-request from the host is ignored rather than moving the page under them
  let userNav = false; document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { userNav = true; }));
  ['wheel', 'touchstart', 'keydown'].forEach(t => addEventListener(t, () => { userNav = true; }, { passive: true }));
  if (window.parent !== window) {
    // the host may ask where a part of the page sits: an embedded frame replies with the position, a standalone frame scrolls itself
    onWhere = e => {
      if (!e.data || e.data.type !== 'sd-audience-where') return;
      if (e.origin !== 'https://thesectordebrief.com' && !e.origin.startsWith('http://localhost')) return;
      const target = { map: '#t-geo-card' }[e.data.what]; if (!target || userNav) return;
      if (!document.getElementById('all').classList.contains('active')) show('all');
      const el = document.querySelector(target); if (!el) return;
      if (EMBEDDED) { report(); parent.postMessage({ type: 'sd-audience-pos', what: e.data.what, top: el.getBoundingClientRect().top + scrollY }, e.origin); }
      else scrollPage(Math.max(0, el.getBoundingClientRect().top + scrollY - 12));
    };
    if (pendingWhere) { const e = pendingWhere; pendingWhere = null; onWhere(e); }
  }
  if (EMBEDDED) {
    document.documentElement.classList.add('embedded');
    new ResizeObserver(report).observe(document.body);
    addEventListener('load', report);
    document.fonts && document.fonts.ready.then(report);
    report();
  }
})();
