/* Renders the audience page from data/audience.json. Inline SVG and HTML, no libraries. */
(async function () {
  const D = await fetch('data/audience.json', { cache: 'no-store' }).then(r => r.json());
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
    host.innerHTML = `<ul class="list${opts.small ? ' small' : ''}${opts.cols ? ' cols' : ''}${opts.tight ? ' tight' : ''}">${rows.map(r => r.sep ? '<li class="sep" aria-hidden="true"></li>' :
      `<li class="${r.muted ? 'muted' : ''}"><span class="n">${esc(r.label)}</span><span class="t"><span class="f${r.v > 0 ? ' nz' : ''}" style="--w:${Math.max(0, Math.min(100, r.v / scale * 100)).toFixed(2)}%"></span></span><span class="v">${r.text}</span></li>`).join('')}</ul>`;
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
    while (d.getTime() <= t1) { el(s, 'text', { x: x(d.getTime()), y: H - 8, 'text-anchor': 'middle' }, MON[d.getMonth()] + (d.getMonth() === 0 ? ' ' + d.getFullYear() : '')); d.setMonth(d.getMonth() + 1); }
    const path = key => series.map((r, i) => (i ? 'L' : 'M') + x(T(r.date)).toFixed(1) + ',' + y(r[key] || 0).toFixed(1)).join('');
    el(s, 'path', { d: path(total) + `L${x(t1).toFixed(1)},${y(0).toFixed(1)}L${x(t0).toFixed(1)},${y(0).toFixed(1)}Z`, class: 'area' + (part ? ' b' : '') });
    el(s, 'path', { d: path(total), class: 'line' + (part ? ' b' : '') });
    if (part) el(s, 'path', { d: path(part), class: 'line' });
    const lastR = series[series.length - 1], lx = x(t1), ly = y(lastR[total] || 0);
    el(s, 'circle', { cx: lx, cy: ly, r: 4, class: 'end-dot' });
    if ((lastR[total] || 0) > 0) el(s, 'text', { x: lx - 8, y: Math.max(m.t + 10, ly - 10), 'text-anchor': 'end', class: 'end-val' }, n(lastR[total]));
    host.appendChild(s);
  }

  // monthly columns with an optional second label line
  function columns(host, rows, opts = {}) {
    host.innerHTML = '';
    const W = width(host), H = opts.h || 200, m = { l: 4, r: 4, t: 24, b: 38 };
    const s = el(document.createDocumentFragment(), 'svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': opts.label || '' });
    const max = Math.max(1, ...rows.map(r => r.count)), gap = 12, bw = (W - m.l - m.r - gap * (rows.length - 1)) / rows.length;
    const y = v => H - m.b - v / max * (H - m.t - m.b);
    el(s, 'line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'base' });
    rows.forEach((r, i) => {
      const xx = m.l + i * (bw + gap), note = opts.note ? opts.note(r) : '';
      el(s, 'rect', { x: xx, y: y(r.count), width: bw, height: Math.max(0, y(0) - y(r.count)), rx: 2, class: 'col' + (note ? ' part' : '') });
      el(s, 'text', { x: xx + bw / 2, y: y(r.count) - 6, 'text-anchor': 'middle', class: 'val' }, n(r.count));
      el(s, 'text', { x: xx + bw / 2, y: H - 22, 'text-anchor': 'middle' }, MON[+r.month.slice(5) - 1] + ' ' + r.month.slice(0, 4));
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

    list($('#v-geo'), V.geography.map(g => ({ label: g.name, v: g.views / tot * 100, text: pc(g.views / tot * 100) })), { small: true, cols: true, scale: 'max' });
    table($('#v-geo-card'), 'Views by country', ['Country', 'Views', 'Share %'], V.geography.map(g => [g.name, g.views, (g.views / tot * 100).toFixed(2)]));

    const male = V.age_gender.reduce((a, b) => a + b.male_pct, 0), female = V.age_gender.reduce((a, b) => a + b.female_pct, 0);
    list($('#v-age'), [{ label: 'Male', v: male, text: pc(male) }, { label: 'Female', v: female, text: pc(female) }, { sep: true }]
      .concat(V.age_gender.map(b => ({ label: b.band + ' years', v: b.male_pct + b.female_pct, text: pc(b.male_pct + b.female_pct) }))));
    table($('#v-age-card'), 'Share of views by gender and age', ['Group', 'Share %'], [['Male', male.toFixed(2)], ['Female', female.toFixed(2)]].concat(V.age_gender.map(b => [b.band, (b.male_pct + b.female_pct).toFixed(2)])));

    list($('#v-dev'), V.devices.map(d => ({ label: d.name, v: d.views / tot * 100, text: pc(d.views / tot * 100) })).concat([{ sep: true }, { label: 'Not reported', v: V.devices_other / tot * 100, text: pc(V.devices_other / tot * 100), muted: true }]));
    table($('#v-dev-card'), 'Views by device type', ['Device', 'Views'], V.devices.map(d => [d.name, d.views]).concat([['Not reported', V.devices_other]]));

    $('#v-daily-p').innerHTML = `Views per day · <b>${vPeriod}</b>`;
    daily($('#v-daily'), V.daily, { label: 'Views per day', h: 190 });
    $('#v-daily-foot').innerHTML = `YouTube's totals table reports <b>${n(tot)}</b> views; its daily table sums to ${n(V.daily_series_sum)}.`;
    table($('#v-daily-card'), 'Views per day', ['Date', 'Views'], V.daily.map(r => [r.date, r.count]));

    list($('#v-cc'), V.captions.map(c => ({ label: c.name, v: c.views / tot * 100, text: pc(c.views / tot * 100) })).concat([{ sep: true }, { label: 'Not reported', v: V.captions_other / tot * 100, text: pc(V.captions_other / tot * 100), muted: true }]), { small: true, tight: true });
    table($('#v-cc-card'), 'Views by subtitle language', ['Captions', 'Views'], V.captions.map(c => [c.name, c.views]).concat([['Not reported', V.captions_other]]));

    $('#v-month-p').innerHTML = `Views per month`;
    columns($('#v-month'), V.monthly, { label: 'Views per month', h: 230, note: r => monthNote(r, V.period_start, V.period_end) });
    table($('#v-month-card'), 'Views by month', ['Month', 'Views'], V.monthly.map(r => [r.month, r.count]));

    $('#v-sub-p').innerHTML = `Subscribers · <b>${vPeriod}</b>`;
    daily($('#v-sub'), V.subscriber_series.map(r => ({ date: r.date, count: r.subscribers })), { label: 'Subscribers over time', h: 190 });
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

    $('#a-month-p').innerHTML = `Plays and downloads per month`;
    columns($('#a-month'), A.monthly, { label: 'Plays and downloads per month', h: 230, note: r => monthNote(r, A.period_start, A.period_end) });
    table($('#a-month-card'), 'Audio by month', ['Month', 'Count'], A.monthly.map(r => [r.month, r.count]));
  }

  function renderWebsite() {
    const Wb = D.website; if (!Wb) return;
    const tot = Wb.total_impressions, per = `${dm(Wb.period_start)} to ${dm(Wb.period_end)}`;
    $('#w-summary').innerHTML = kpi('Impressions in Google Search', n(tot), `${per} · the export's ${Wb.window.toLowerCase()} window`);
    list($('#w-geo'), Wb.countries.map(g => ({ label: g.name, v: g.impressions / tot * 100, text: pc(g.impressions / tot * 100) })), { small: true, cols: true, scale: 'max' });
    table($('#w-geo-card'), 'Impressions by country', ['Country', 'Impressions', 'Share %'], Wb.countries.map(g => [g.name, g.impressions, (g.impressions / tot * 100).toFixed(2)]));
    list($('#w-dev'), Wb.devices.map(d => ({ label: d.name, v: d.impressions / tot * 100, text: pc(d.impressions / tot * 100) })));
    table($('#w-dev-card'), 'Impressions by device', ['Device', 'Impressions'], Wb.devices.map(d => [d.name, d.impressions]));
    $('#w-month-p').innerHTML = `Impressions per month`;
    columns($('#w-month'), Wb.monthly, { label: 'Impressions per month', h: 210, note: r => monthNote(r, Wb.period_start, Wb.period_end) });
    table($('#w-month-card'), 'Impressions by month', ['Month', 'Impressions'], Wb.monthly.map(r => [r.month, r.count]));
    $('#w-daily-p').innerHTML = `Impressions per day · <b>${per}</b>`;
    daily($('#w-daily'), Wb.daily, { label: 'Impressions per day', h: 190 });
    table($('#w-daily-card'), 'Impressions per day', ['Date', 'Impressions'], Wb.daily.map(r => [r.date, r.count]));
  }

  $('#brand-sub').textContent = `The Sector Debrief · updated ${dm(D.sources[0].exported_at).replace(' Sep ', ' September ')} · updated monthly`;

  const rendered = {};
  const RENDER = { video: renderVideo, audio: renderAudio, website: renderWebsite };
  const viewOf = hash => ['audio', 'website'].includes(hash.slice(1)) ? hash.slice(1) : 'video';
  function show(view) {
    document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.view === view; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === view));
    if (!rendered[view]) { RENDER[view](); rendered[view] = true; }
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
  $('.tabs').addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const tabs = [...document.querySelectorAll('.tab:not([hidden])')]; const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'); const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.view; show(next); document.querySelector(`.tab[data-view="${next}"]`).focus(); e.preventDefault(); });
  addEventListener('hashchange', () => show(viewOf(location.hash)));
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { for (const v in rendered) { if (document.getElementById(v).classList.contains('active')) RENDER[v](); else rendered[v] = false; } }, 150); });
  addEventListener('beforeprint', () => { document.querySelectorAll('.panel').forEach(p => p.classList.add('active')); for (const v in RENDER) { RENDER[v](); rendered[v] = true; } });
  addEventListener('afterprint', () => show(viewOf(location.hash)));
  if (!D.website) document.querySelector('.tab[data-view="website"]').hidden = true;
  show(viewOf(location.hash));
})();
