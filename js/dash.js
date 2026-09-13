/* Renders the audience page from data/audience.json. Inline SVG and HTML, no libraries. */
(async function () {
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

  // list of label, bar, value. Bars start at a common left edge. scale: 100 for shares, or the largest value for rankings.
  function list(host, rows, opts = {}) {
    const scale = opts.scale === 'max' ? Math.max(...rows.filter(r => !r.sep).map(r => r.v), 1e-9) : 100;
    const nums = rows.some(r => r.count !== undefined);
    host.innerHTML = `<ul class="list${opts.small ? ' small' : ''}${opts.cols ? ' cols' : ''}${opts.tight ? ' tight' : ''}${nums ? ' nums' : ''}">${rows.map((r, i) => r.sep ? '<li class="sep" aria-hidden="true"></li>' :
      `<li class="${r.muted ? 'muted' : ''}" style="--i:${Math.min(i, 30)}"><span class="n">${esc(r.label)}</span><span class="t"><span class="f${r.v > 0 ? ' nz' : ''}" style="--w:${Math.max(0, Math.min(100, r.v / scale * 100)).toFixed(2)}%"></span></span>${nums ? `<span class="c">${r.count === undefined ? '' : (r.est ? '≈ ' : '') + n(r.count)}</span>` : ''}<span class="v">${r.text}</span></li>`).join('')}</ul>`;
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
    while (d.getTime() <= t1) { el(s, 'text', { x: x(d.getTime()), y: H - 8, 'text-anchor': 'middle' }, MON[d.getMonth()] + (d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : '')); d.setMonth(d.getMonth() + 1); }
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
    const W = width(host), H = opts.h || 200, m = { l: 4, r: 4, t: 24, b: 38 };
    const s = el(document.createDocumentFragment(), 'svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.label || '' });
    const max = Math.max(1, ...rows.map(r => r.count)), slot = Math.min(168, (W - m.l - m.r) / rows.length), bw = Math.min(96, slot * .72), x0 = m.l + (W - m.l - m.r - slot * rows.length) / 2;
    const y = v => H - m.b - v / max * (H - m.t - m.b);
    el(s, 'line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'base' });
    rows.forEach((r, i) => {
      const xx = x0 + (i + .5) * slot - bw / 2, note = opts.note ? opts.note(r) : '';
      el(s, 'rect', { x: xx, y: y(r.count), width: bw, height: Math.max(0, y(0) - y(r.count)), rx: 2, class: 'col' + (note ? ' part' : '') });
      el(s, 'text', { x: xx + bw / 2, y: y(r.count) - 6, 'text-anchor': 'middle', class: 'val' }, n(r.count));
      el(s, 'text', { x: xx + bw / 2, y: H - 22, 'text-anchor': 'middle' }, MON[+r.month.slice(5) - 1] + (slot < 90 ? ' ' + r.month.slice(2, 4) : ' ' + r.month.slice(0, 4)));
      if (note) el(s, 'text', { x: xx + bw / 2, y: H - 7, 'text-anchor': 'middle', class: 'note' }, note);
    });
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

    list($('#v-geo'), V.geography.map(g => ({ label: g.name, v: g.views / tot * 100, count: g.views, text: pc(g.views / tot * 100) })), { small: true, cols: true, scale: 'max' });
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

    list($('#a-geo'), A.geography_pct.map(g => ({ label: g.name, v: g.pct, text: pc(g.pct) })), { small: true, cols: true, scale: 'max' });
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
    list($('#w-geo'), Wb.countries.map(g => ({ label: g.name, v: g.impressions / tot * 100, text: pc(g.impressions / tot * 100) })), { small: true, cols: true, scale: 'max' });
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
    $('#t-summary').innerHTML = kp('pv', 'YouTube views', n(vt), vPeriod) + kp('pa', 'Podcast plays and downloads', n(at), aPeriod) + (Wb ? kp('pw', 'Google Search impressions', n(wt), wPeriod) : '');

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

    // age: each platform keeps its own bands
    $('#t-age').innerHTML = '<div class="pv"><p class="hd">Video</p><div id="t-age-v"></div></div><div class="pa"><p class="hd">Audio</p><div id="t-age-a"></div></div>';
    list($('#t-age-v'), V.age_gender.map(b => ({ label: b.band + ' years', v: b.male_pct + b.female_pct, text: pc(b.male_pct + b.female_pct) })));
    list($('#t-age-a'), P.age.filter(b => b.band !== 'Unknown').map(b => ({ label: b.band + ' years', v: b.pct, text: pc(b.pct) })));
    table($('#t-age-card'), 'Age by platform', ['Platform', 'Band', 'Share %'], V.age_gender.map(b => ['Video', b.band, (b.male_pct + b.female_pct).toFixed(2)]).concat(P.age.map(b => ['Audio', b.band, b.pct.toFixed(2)])));

    // countries: one row per country, three shares on one shared scale
    const m = new Map(); const put = (name, k, v) => { if (!m.has(name)) m.set(name, { name, v: null, a: null, w: null }); m.get(name)[k] = v; };
    V.geography.forEach(g => put(g.name, 'v', g.views / vt * 100));
    A.geography_pct.forEach(g => put(g.name, 'a', g.pct));
    const top = r => Math.max(r.v ?? -1, r.a ?? -1);
    const rows = [...m.values()].sort((x, y) => top(y) - top(x) || x.name.localeCompare(y.name));
    const scale = Math.max(...rows.flatMap(r => [r.v, r.a]).filter(x => x !== null));
    const cell = (k, v) => v === null ? '<span class="cell"></span>' : `<span class="cell"><span class="t"><span class="f ${k}${v > 0 ? ' nz' : ''}" style="--w:${(v / scale * 100).toFixed(2)}%"></span></span><span class="v">${pc(v)}</span></span>`;
    const half = Math.ceil(rows.length / 2);
    const block = rs => `<ul class="list tri"><li class="heads"><span></span><span class="pv">Video</span><span class="pa">Audio</span></li>${rs.map((r, i) => `<li style="--i:${Math.min(i, 30)}"><span class="n">${esc(r.name)}</span>${cell('pv', r.v)}${cell('pa', r.a)}</li>`).join('')}</ul>`;
    // the map: land in the Equal Earth projection, one pin per country, a filled dot for Video and a ring for Audio, both sized by share
    let map = '';
    if (WORLD) {
      const R = v => v === null ? 0 : 2.4 + 13 * Math.sqrt(v / scale);
      const pins = rows.filter(r => WORLD.pins[r.name]).map(r => { const [x, y] = WORLD.pins[r.name]; const t = esc(r.name) + (r.v !== null ? ' · Video ' + pc(r.v) : '') + (r.a !== null ? ' · Audio ' + pc(r.a) : '');
        return `<g class="pin" transform="translate(${x} ${y})"><title>${t}</title>${r.v !== null ? `<circle class="pv" r="${R(r.v).toFixed(1)}"/>` : ''}${r.a !== null ? `<circle class="pa" r="${R(r.a).toFixed(1)}"/>` : ''}<circle class="core" r="1.6"/></g>`; });
      map = `<svg class="map" viewBox="0 0 ${WORLD.w} ${WORLD.h}" role="img" aria-label="World map with a pin for every country that watches or listens"><path class="land" d="${WORLD.land}"/>${pins.join('')}</svg>
      <div class="maplegend"><span><i class="dot"></i>Video</span><span><i class="ring"></i>Audio</span></div>`;
    }
    $('#t-geo').innerHTML = `${map}<div class="twin">${block(rows.slice(0, half))}${block(rows.slice(half))}</div>`;
    table($('#t-geo-card'), 'Countries by platform', ['Country', 'Video share of views %', 'Audio share of plays and downloads %'], rows.map(r => [r.name, r.v === null ? '' : r.v.toFixed(2), r.a === null ? '' : r.a.toFixed(2)]));
  }

  $('#brand-sub').textContent = `The Sector Debrief · updated ${dm(D.sources[0].exported_at).replace(' Sep ', ' September ')} · updated quarterly`;

  const rendered = {};
  const RENDER = { all: renderAll, video: renderVideo, audio: renderAudio, website: renderWebsite };
  const viewOf = hash => ['video', 'audio', 'website'].includes(hash.slice(1)) ? hash.slice(1) : 'all';
  function show(view) {
    document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.view === view; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === view));
    if (!rendered[view]) { RENDER[view](); rendered[view] = true; }
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
  $('.tabs').addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const tabs = [...document.querySelectorAll('.tab:not([hidden])')]; const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'); const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.view; show(next); document.querySelector(`.tab[data-view="${next}"]`).focus(); e.preventDefault(); });
  addEventListener('hashchange', () => show(viewOf(location.hash)));
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { for (const v in rendered) { const p = document.getElementById(v); p.classList.add('settled'); if (p.classList.contains('active')) RENDER[v](); else rendered[v] = false; } }, 150); });
  addEventListener('beforeprint', () => { document.querySelectorAll('.panel').forEach(p => p.classList.add('active')); for (const v in RENDER) { RENDER[v](); rendered[v] = true; } });
  addEventListener('afterprint', () => show(viewOf(location.hash)));
  if (!D.website) document.querySelector('.tab[data-view="website"]').hidden = true;
  show(viewOf(location.hash));
})();
