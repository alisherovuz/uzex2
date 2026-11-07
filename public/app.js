const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('ru-RU').replace(/ /g, ' '));
const big = (n) => (n == null ? '—' : n >= 1e12 ? `${(n / 1e12).toFixed(2).replace('.', ',')} trln` : n >= 1e9 ? `${(n / 1e9).toFixed(2).replace('.', ',')} mlrd` : n >= 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')} mln` : fmt(n));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pct = (x, d = 1) => `${(x * 100).toFixed(d).replace('.', ',')}%`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

let BUYER = store.get('aniq_buyer');
if (!BUYER) { BUYER = 'u-' + Math.random().toString(36).slice(2, 10); store.set('aniq_buyer', BUYER); }
let NAME = store.get('aniq_name') || 'Mehmon';
let S = null, skew = 0, view = { key: '' };
const nowS = () => Date.now() + skew;

async function api(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
const lotTime = (l) => (l.phase === 'open' ? { left: l.closesAt - nowS(), frac: (l.closesAt - nowS()) / (l.closesAt - l.opensAt) } : { left: (l.revealUntil ?? 0) - nowS(), frac: 0 });
const ringSvg = (frac, size = 40, sw = 4) => { const r = size / 2 - sw, c = 2 * Math.PI * r; return `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#f2f4f7" stroke-width="${sw}" fill="none"/><circle class="p" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#0b8a63" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, frac)))}"/></svg>`; };
const searchIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

// ---------- market helpers ----------
const prices = (l) => l.history.filter((h) => h.price).map((h) => h.price);
const lastP = (l) => prices(l).at(-1) ?? null;
const chg = (l) => { const p = prices(l); return p.length < 2 ? null : p.at(-1) / p.at(-2) - 1; };
const chgHtml = (c) => (c == null ? '<span class="fl">—</span>' : `<span class="${c > 0.0005 ? 'up' : c < -0.0005 ? 'dn' : 'fl'}">${c > 0 ? '+' : ''}${pct(c, 2)}</span>`);
function spark(l, w = 96, h = 26) {
  const p = prices(l).slice(-30); if (p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), sp = hi - lo || 1;
  const pts = p.map((v, i) => `${((i / (p.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / sp) * (h - 4)).toFixed(1)}`).join(' ');
  const up = p.at(-1) >= p[0];
  return `<svg width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${up ? '#0b8a63' : '#d92d20'}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

// ---------- polling ----------
async function poll() {
  try { const t0 = Date.now(); const s = await api(`/api/state?buyer=${encodeURIComponent(BUYER)}`); skew = s.now - (t0 + Date.now()) / 2; S = s; render(); } catch {}
  setTimeout(poll, 1000);
}
setInterval(() => { if (S) tickUI(); }, 250);
addEventListener('hashchange', () => { view.key = ''; render(); window.scrollTo({ top: 0 }); });

function render() {
  if (!S) return;
  $('#wbal').textContent = `${big(S.wallet.balance - S.wallet.reserved)} so'm`;
  const h = location.hash || '#/';
  const tab = h.startsWith('#/buy') ? 'buy' : h.startsWith('#/results') ? 'results' : h.startsWith('#/me') ? 'me' : 'home';
  document.querySelectorAll('[data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === tab));
  const m = h.match(/^#\/lot\/(\w+)/);
  if (m) return lotPage(m[1]);
  if (h.startsWith('#/buy')) return buyPage();
  if (h.startsWith('#/results')) return resultsPage();
  if (h.startsWith('#/me')) return mePage();
  return homePage();
}
function tickUI() {
  document.querySelectorAll('[data-timer]').forEach((el) => {
    const l = S.lots.find((x) => x.id === el.dataset.timer); if (!l) return;
    const t = lotTime(l);
    const txt = el.querySelector('[data-tt]'); if (txt) txt.textContent = l.phase === 'open' ? mmss(t.left) : 'Yopildi';
    const p = el.querySelector('circle.p'); if (p) { const c = +p.getAttribute('stroke-dasharray'); p.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, t.frac))); }
  });
  document.querySelectorAll('[data-next]').forEach((el) => { const l = S.lots.find((x) => x.id === el.dataset.next); if (l) el.textContent = mmss(lotTime(l).left); });
  const c = $('#clock'); if (c) c.textContent = 'Savdo ochiq · ' + new Date(nowS()).toLocaleTimeString('uz-UZ', { hour12: false, timeZone: 'Asia/Tashkent' });
}

// ---------- home: market ----------
let CAT = 'all', Q = '';
const filtered = () => S.lots.filter((l) => (CAT === 'all' || l.cat === CAT) && (!Q || (l.product + l.grade + l.depot + l.seller).toLowerCase().includes(Q.toLowerCase())));
function lotRow(l) {
  const t = lotTime(l);
  return `<div class="tr click" data-go="${l.id}">
    <div class="prod"><div class="badge">${l.code}</div><div style="min-width:0"><b>${esc(l.product)}</b><small>${esc(l.grade)}</small></div></div>
    <div class="hide-m" style="min-width:0"><div class="ell">${esc(l.seller)}</div><div class="tiny ell">${esc(l.depot)}</div></div>
    <div class="r tnum hide-m">${fmt(l.supply)} t</div>
    <div class="r tnum hide-m">${fmt(l.reserve)}</div>
    <div class="r"><div class="tnum">${fmt(lastP(l))}</div><div class="tiny">${chgHtml(chg(l))}</div></div>
    <div class="c hide-m">${spark(l)}</div>
    <div class="c hide-m">${l.phase === 'open' ? `<span class="tnum">${l.sealed}</span>` : '<span class="chip">Natija</span>'}</div>
    <div class="r hide-m tnum" data-timer="${l.id}"><span data-tt>${l.phase === 'open' ? mmss(t.left) : 'Yopildi'}</span></div>
    <div class="r"><button class="btn sm ${l.mine ? 'sec' : ''}">${l.mine ? 'Taklifim' : 'Taklif'}</button></div>
  </div>`;
}
function paintTable() {
  const g = $('#lottable'); if (!g) return;
  const list = filtered();
  const sig = list.map((l) => `${l.id}:${l.phase}:${l.round}:${l.sealed}:${!!l.mine}`).join('|') + CAT + Q;
  if (g.dataset.sig === sig) return;
  g.dataset.sig = sig;
  g.innerHTML = `<div class="tr h"><div>Tovar</div><div>Sotuvchi · hudud</div><div class="r">Hajm</div><div class="r">Start narx, so'm/t</div><div class="r">Bozor narxi</div><div class="c">45 kun</div><div class="c">Takliflar</div><div class="r">Yopilish</div><div></div></div>
    ${list.length ? list.map(lotRow).join('') : '<div class="empty">Mos lot topilmadi</div>'}`;
  g.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => { location.hash = '#/lot/' + r.dataset.go; });
}
function kpiStrip() {
  const D = S.market.data;
  return `<div class="card kpis">
    <div><div class="k">Reyestrdagi bitimlar</div><div class="v num">${fmt(D.deals)}</div><div class="s">${D.from.slice(0, 4)}–${D.to.slice(0, 4)}</div></div>
    <div><div class="k">Aylanma, oxirgi 30 kun</div><div class="v num">${big(D.d30.turnover)}</div><div class="s">so'm · ${fmt(D.d30.deals)} bitim</div></div>
    <div><div class="k">Ishtirokchilar</div><div class="v num">${fmt(D.participants)}</div><div class="s">sotuvchi va xaridorlar</div></div>
    <div><div class="k">Bugungi raundlar</div><div class="v num">${fmt(S.market.liveRounds)}</div><div class="s">${fmt(S.market.liveTonnes)} t taqsimlandi</div></div>
  </div>`;
}
function homePage() {
  if (view.key !== 'home') {
    view.key = 'home';
    const t = new Date(nowS() + 5 * 3600_000), MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const d = `${t.getUTCDate()}-${MONTHS[t.getUTCMonth()]}, ${t.getUTCFullYear()}`;
    app.innerHTML = `
      <div class="ph"><div><h1>Spot savdo</h1><div class="sub">${d} · yashirin takliflar, yagona narx</div></div></div>
      ${kpiStrip()}
      <div class="ph" style="margin:20px 0 10px;align-items:center">
        <div class="seg" id="cats">${[['all', 'Hammasi'], ...Object.entries(S.categories)].map(([k, v]) => `<button data-cat="${k}" class="${CAT === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <label class="search">${searchIcon}<input id="q" placeholder="Tovar, sotuvchi yoki hudud" value="${esc(Q)}"></label>
      </div>
      <div class="card tbl lots" id="lottable"></div>
      <div class="foot">Bozor narxi va dinamika — tashkilotchilar bergan UZEX reyestri (${fmt(S.market.data.deals)} bitim) bo'yicha kunlik median. Ochiq raundlar va boshqa ishtirokchilar — simulyatsiya.</div>`;
    app.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { CAT = b.dataset.cat; app.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); paintTable(); });
    $('#q').oninput = (e) => { Q = e.target.value; paintTable(); };
  }
  paintTable();
}

// ---------- lot page ----------
const form = { qty: null, price: null, preset: null };
let PRESETS = {};
function lotPage(id) {
  const l = S.lots.find((x) => x.id === id);
  if (!l) { app.innerHTML = '<div class="empty">Lot topilmadi</div>'; return; }
  const key = `lot:${id}:${l.phase}:${l.round}`;
  if (view.key !== key) { view.key = key; l.phase === 'open' ? openView(l) : revealView(l); }
  else if (l.phase === 'open') updateOpen(l);
}
function header(l) {
  const t = lotTime(l);
  return `<div class="crumb"><a href="#/">Spot savdo</a> / ${esc(l.product)}</div>
  <div class="lh"><div class="badge lg">${l.code}</div><div><h1>${esc(l.product)}</h1><div class="muted">${esc(l.grade)} · lot ${l.id.toUpperCase()}-${l.round}</div></div>
    ${l.phase === 'open' ? '<span class="chip g"><i></i>Qabul qilinmoqda</span>' : '<span class="chip">Raund yakunlandi</span>'}
    <div class="timer" data-timer="${l.id}"><span class="tiny">${l.phase === 'open' ? 'Yopilishigacha' : 'Keyingi raund'}</span>${l.phase === 'open' ? `<b data-tt>${mmss(t.left)}</b>` : `<b data-next="${l.id}"></b>`}</div></div>`;
}
function terms(l) {
  const items = [['Sotuvchi', l.seller], ['Hudud', l.depot], ['Hajm', fmt(l.supply) + ' t'], ['Start narx', fmt(l.reserve) + " so'm/t"], ['Narx qadami', fmt(l.tick) + " so'm"], ['Yetkazish', l.delivery], ['Reyestrdagi bitimlar', fmt(l.ref.deals)], ['Qoida', S.rule]];
  return `<div class="card terms">${items.map(([k, v]) => `<div><div class="k">${k}</div><div class="v ell">${esc(v)}</div></div>`).join('')}</div>`;
}
function chart(l) {
  const H = l.history.filter((h) => h.price).slice(-45);
  if (H.length < 2) return '';
  const W = 640, Ht = 220, L = 66, R = 10, T = 12, B = 54;
  const ps = H.map((h) => h.price), lo = Math.min(...ps, l.ref.p10) * 0.99, hi = Math.max(...ps, l.ref.p90) * 1.01;
  const x = (i) => L + (i / (H.length - 1)) * (W - L - R), y = (p) => T + (1 - (p - lo) / (hi - lo)) * (Ht - T - B);
  const maxV = Math.max(...H.map((h) => h.traded), 1);
  const line = H.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.price).toFixed(1)}`).join('');
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#f2f4f7"/><text x="${L - 8}" y="${y(v) + 4}" font-size="11" fill="#98a2b3" text-anchor="end">${big(v)}</text>`).join('');
  const first = H[0].date || '', last = H.at(-1).date || 'bugun';
  return `<div class="card pad chart">
    <div class="row" style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><div><div class="lbl" style="margin:0">Narx tarixi, so'm/t</div><div class="tiny">Kunlik median · UZEX reyestri</div></div>
      <div class="r"><div class="tnum" style="font-size:18px">${fmt(lastP(l))}</div><div class="tiny">${chgHtml(chg(l))} oxirgi kun</div></div></div>
    <svg viewBox="0 0 ${W} ${Ht}" width="100%">${ticks}
      <rect x="${L}" y="${y(l.ref.p90)}" width="${W - L - R}" height="${y(l.ref.p10) - y(l.ref.p90)}" fill="#ecfdf3" opacity=".6"/>
      <line x1="${L}" x2="${W - R}" y1="${y(l.reserve)}" y2="${y(l.reserve)}" stroke="#0b8a63" stroke-dasharray="4 4"/>
      <text x="${W - R}" y="${y(l.reserve) - 5}" font-size="11" fill="#0b8a63" text-anchor="end">start narx</text>
      ${H.map((h, i) => `<rect x="${x(i) - 3}" y="${Ht - 18 - (h.traded / maxV) * 26}" width="6" height="${(h.traded / maxV) * 26}" fill="#d0d5dd" rx="1"/>`).join('')}
      <path class="ln" d="${line}" fill="none" stroke="#101828" stroke-width="1.8" stroke-linejoin="round"/>
      <text x="${L}" y="${Ht - 2}" font-size="11" fill="#98a2b3">${first}</text><text x="${W - R}" y="${Ht - 2}" font-size="11" fill="#98a2b3" text-anchor="end">${last}</text>
    </svg>
    <div class="tiny">Yashil zona — 90 kunlik oraliq (P10–P90). Ustunlar — kunlik hajm.</div></div>`;
}
async function loadPresets(l) {
  const r = await Promise.all(['low', 'normal', 'high'].map((u) => api('/api/agent/suggest', { lotId: l.id, need: form.qty, urgency: u })));
  const tk = l.tick * Math.max(1, Math.round(l.reserve / l.tick / 200));
  const normal = Math.max(r[1].maxPrice, r[0].maxPrice + tk);
  PRESETS[l.id] = { low: r[0].maxPrice, normal, high: Math.max(r[2].maxPrice, normal + tk) };
  return PRESETS[l.id];
}
function openView(l) {
  form.qty = l.mine?.qty ?? Math.max(1, Math.round(l.supply / 10));
  form.price = l.mine?.maxPrice ?? null;
  app.innerHTML = `${header(l)}
  <div class="g2">
    <div class="stack">${chart(l)}${terms(l)}</div>
    <div class="stack">
      <div class="card pad ticket">
        <div class="row" style="margin-bottom:12px"><b style="font-size:16px">Sotib olish taklifi</b><span class="chip" id="sealedct">${l.sealed} ta taklif</span></div>
        <div class="lbl">Hajm, tonna</div>
        <div class="field"><button data-q="-1">−</button><input id="qv" inputmode="numeric" value="${form.qty}"><span class="u">t</span><button data-q="1">+</button></div>
        <div class="lbl" style="margin-top:14px">Narx chegarasi</div>
        <div class="presets" id="presets"><button disabled><b>Tejamkor</b><span>…</span></button><button disabled><b>Odatiy</b><span>…</span></button><button disabled><b>Ishonchli</b><span>…</span></button></div>
        <div class="field" style="margin-top:8px"><input id="pv" inputmode="numeric" placeholder="so'm / tonna"><span class="u">so'm/t</span></div>
        <div class="tiny" id="pnote" style="margin-top:6px">Start narx ${fmt(l.reserve)} · qadam ${fmt(l.tick)}</div>
        <div class="sum" style="margin-top:12px"><div><span>Maksimal qiymat</span><b id="smax">—</b></div><div><span>Birja yig'imi (0,1%)</span><b id="sfee">—</b></div><div><span>Band qilinadi</span><b id="sres">—</b></div></div>
        <div class="note" style="margin:12px 0">G'oliblar bir xil narx to'laydi. Chegaradan kam to'lasangiz, farqi avtomatik qaytadi.</div>
        <div style="display:flex;gap:8px"><button class="btn lg" id="seal" style="flex:1">Taklifni muhrlash</button><button class="btn sec lg" id="cancel" style="display:none">Bekor</button></div>
        <div class="sealed" id="sealed"></div>
      </div>
      <div id="rcpt"></div>
    </div>
  </div>`;
  const qv = $('#qv'), pv = $('#pv');
  const paint = () => {
    const max = (form.qty || 0) * (form.price || 0);
    $('#smax').textContent = form.price ? big(max) + " so'm" : '—';
    $('#sfee').textContent = form.price ? big(Math.ceil(max / 1000)) + " so'm" : '—';
    $('#sres').textContent = form.price ? big(max + Math.ceil(max / 1000)) + " so'm" : '—';
    $('#pnote').innerHTML = form.price && form.price < l.reserve ? '<span class="dn">Start narxdan past — savdoga kirmaydi</span>' : form.price && form.price % l.tick ? `<span class="dn">Narx ${fmt(l.tick)} so'm qadamiga karrali bo'lsin</span>` : `Start narx ${fmt(l.reserve)} · qadam ${fmt(l.tick)}`;
    app.querySelectorAll('[data-pr]').forEach((b) => b.classList.toggle('on', +b.dataset.v === form.price));
  };
  qv.oninput = () => { form.qty = Math.max(0, parseInt(qv.value.replace(/\D/g, ''), 10) || 0); paint(); };
  pv.oninput = () => { form.price = parseInt(pv.value.replace(/\D/g, ''), 10) || null; paint(); };
  app.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { form.qty = Math.min(l.supply, Math.max(1, (form.qty || 0) + +b.dataset.q)); qv.value = form.qty; paint(); });
  loadPresets(l).then((P) => {
    const box = $('#presets'); if (!box) return;
    box.innerHTML = [['low', 'Tejamkor'], ['normal', 'Odatiy'], ['high', 'Ishonchli']].map(([k, t]) => `<button data-pr="${k}" data-v="${P[k]}"><b>${t}</b><span>${fmt(P[k])}</span></button>`).join('');
    box.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { form.price = +b.dataset.v; pv.value = fmt(form.price); paint(); });
    if (!form.price) { form.price = P.normal; pv.value = fmt(P.normal); }
    paint();
  });
  if (form.price) pv.value = fmt(form.price);
  $('#seal').onclick = async () => {
    if (!form.qty || !form.price) return toast('Hajm va narxni kiriting');
    const r = await api('/api/orders', { lotId: l.id, buyer: BUYER, name: NAME, qty: form.qty, maxPrice: form.price, idemKey: `${BUYER}-${l.id}-${l.round}-${form.qty}-${form.price}` });
    if (!r.ok) return toast(r.reason);
    const cur = S.lots.find((x) => x.id === l.id); cur.mine = { qty: form.qty, maxPrice: form.price, version: r.receipt.version, reserved: r.receipt.reserved };
    receipt(r.receipt); updateOpen(cur); toast('Taklif muhrlandi');
  };
  $('#cancel').onclick = async () => {
    const r = await api('/api/orders', { lotId: l.id, buyer: BUYER }, 'DELETE');
    if (r.ok) { S.lots.find((x) => x.id === l.id).mine = null; $('#rcpt').innerHTML = ''; updateOpen(S.lots.find((x) => x.id === l.id)); toast('Taklif bekor qilindi'); } else toast(r.reason);
  };
  paint(); updateOpen(l);
  if (l.mine) receipt({ version: l.mine.version, reserved: l.mine.reserved });
}
function receipt(rc) {
  const l = S.lots.find((x) => x.id === (location.hash.split('/')[2]));
  $('#rcpt').innerHTML = `<div class="card pad in"><div class="row" style="display:flex;justify-content:space-between;align-items:center"><b>Taklifingiz muhrlangan</b><span class="chip g">v${rc.version}</span></div>
    <div class="sum" style="margin-top:8px"><div><span>Hajm</span><b>${fmt(l?.mine?.qty ?? form.qty)} t</b></div><div><span>Narx chegarasi</span><b>${fmt(l?.mine?.maxPrice ?? form.price)} so'm/t</b></div><div><span>Band qilingan</span><b>${big(rc.reserved)} so'm</b></div>
    ${rc.commit ? `<div><span>Muhr</span><b class="mono">${rc.commit.slice(0, 16)}…</b></div>` : ''}</div>
    <div class="tiny" style="margin-top:8px">Raund yopilguncha o'zgartirish yoki bekor qilish mumkin. Summa boshqalarga ko'rinmaydi.</div></div>`;
}
function updateOpen(l) {
  const box = $('#sealed'); if (!box) return;
  if (+box.dataset.n !== l.sealed) { box.innerHTML = Array.from({ length: Math.min(l.sealed, 40) }, () => '<i></i>').join(''); box.dataset.n = l.sealed; }
  $('#sealedct').textContent = `${l.sealed} ta taklif`;
  $('#seal').textContent = l.mine ? 'Taklifni yangilash' : 'Taklifni muhrlash';
  $('#cancel').style.display = l.mine ? '' : 'none';
}
function revealView(l) {
  const L = l.last;
  if (!L) { app.innerHTML = header(l) + '<div class="empty">Natija tayyorlanmoqda…</div>'; return; }
  const me = L.bids.find((b) => b.me), P = L.price;
  const rows = []; let cut = false;
  L.bids.forEach((b) => {
    if (P && b.maxPrice === P && !cut && L.cutoff) { cut = true; rows.push(`<div class="cut">Yagona narx ${fmt(P)} so'm — shu narxdagi takliflar qolgan hajmni ulushga bo'lishadi</div>`); }
    const st = b.x === 0 ? '<span class="chip">Olmadi</span>' : b.x === b.qty ? '<span class="chip g">To\'liq</span>' : '<span class="chip y">Qisman</span>';
    rows.push(`<div class="tr ${b.me ? 'me-row' : ''}"><div class="ell"><b>${esc(b.me ? 'Siz' : b.name)}</b>${b.via === 'phone' ? ' <span class="chip u">telefon</span>' : ''}</div>
      <div class="r tnum">${fmt(b.maxPrice)}</div><div class="r tnum hide-m">${fmt(b.qty)} t</div><div class="r tnum">${fmt(b.x)} t</div><div class="r">${st}</div></div>`);
  });
  app.innerHTML = `${header(l)}
  <div class="g2">
    <div class="stack">
      <div class="card pad"><div class="lbl">Yagona narx</div>
        ${P ? `<div class="bigprice">${fmt(P)} <span class="muted" style="font-size:16px;font-weight:500">so'm/t</span></div>
        <div class="muted" style="margin-top:4px">${fmt(L.traded)} / ${fmt(l.supply)} t sotildi · talab ${fmt(L.demand)} t · ${L.bids.length} ta taklif</div>
        <div class="bar" style="margin-top:12px"><i style="width:${(L.traded / l.supply) * 100}%;background:var(--a)"></i></div>`
        : '<div class="bigprice">Savdo bo\'lmadi</div><div class="muted">Start narxga yetgan taklif bo\'lmadi. Band qilingan mablag\'lar qaytarildi.</div>'}</div>
      <div class="card tbl alloc"><div class="tr h"><div>Ishtirokchi</div><div class="r">Narx chegarasi</div><div class="r">So'radi</div><div class="r">Oldi</div><div class="r">Holat</div></div>${rows.join('')}</div>
    </div>
    <div class="stack">
      ${me ? `<div class="card pad in"><div class="lbl">Sizning natijangiz</div><div style="font-size:22px;font-weight:700">${me.x ? `${fmt(me.x)} t sotib olindi` : 'Taklif yutmadi'}</div>
        <div class="sum" style="margin-top:8px"><div><span>To'landi</span><b>${big(me.debit)} so'm</b></div><div><span>Qaytarildi</span><b class="up">${big(me.released)} so'm</b></div></div></div>` : ''}
      <div class="card pad"><div class="lbl">Savdo protokoli</div><div class="sum">
        ${[['Lot', `${l.id.toUpperCase()}-${L.round}`], ['Sotuvchi', l.seller], ['Taklif etildi', fmt(l.supply) + ' t'], ['Sotildi', `${fmt(L.traded)} t (${Math.round((L.traded / l.supply) * 100)}%)`], ['Yagona narx', P ? fmt(P) + " so'm/t" : '—'], ['Summa', P ? big(P * L.traded) + " so'm" : '—'], ['Qur\'a urug\'i xeshi', L.seedHash.slice(0, 14) + '…'], ['Yozuv xeshi', L.recordHash.slice(0, 14) + '…']]
          .map(([k, v]) => `<div><span>${k}</span><b class="${k.includes('xesh') ? 'mono' : ''}">${esc(v)}</b></div>`).join('')}</div>
        <button class="btn sec" id="verify" style="width:100%;margin-top:12px">Natijani mustaqil tekshirish</button><div id="vres"></div></div>
    </div>
  </div>`;
  $('#verify').onclick = async () => {
    const r = await api('/api/verify', { lotId: l.id });
    if (!r.ok) return toast(r.reason);
    $('#vres').innerHTML = `<div style="margin-top:10px">${[[true, 'Takliflar kelish tartibi aralashtirildi'], [r.sameResult, 'Qayta hisoblash natijasi bir xil'], [r.seedMatches, 'Qur\'a urug\'i e\'lon qilingan xeshga mos'], [r.recordIntact, 'Protokol o\'zgartirilmagan']]
      .map(([ok, t], k) => `<div class="chk ${ok ? '' : 'no'} in" style="--d:${k * 3}"><span>${ok ? '✓' : '✕'}</span>${t}</div>`).join('')}</div>`;
  };
}

// ---------- easy buy ----------
const B = { step: 1, lot: null, qty: 10, preset: 'normal', prices: null, placed: null, retry: false };
function easyHead() { return `<div class="ehead">${B.step > 1 && B.step < 5 ? '<button class="btn sec icon" id="eback">←</button>' : ''}<div class="steps">${[1, 2, 3, 4].map((i) => `<i class="${i <= B.step ? 'on' : ''}"></i>`).join('')}</div></div>`; }
function buyPage() {
  const L = S.lots.find((l) => l.id === B.lot);
  const key = `buy:${B.step}:${B.lot}`;
  if (view.key === key) { if (B.step === 5) easyWait(); return; }
  view.key = key;
  let body = '';
  if (B.step === 1) body = `<h2 class="etitle">Nima sotib olasiz?</h2><div class="muted" style="margin-bottom:14px">Bugungi narxlar — UZEX reyestri bo'yicha</div>
    <div class="card tbl elist">${S.lots.map((l) => `<div class="tr click" data-pick="${l.id}"><div class="prod"><div class="badge">${l.code}</div><div><b>${esc(l.product)}</b><small>${esc(l.grade)} · ${esc(l.depot)}</small></div></div><div class="r"><div class="tnum">${fmt(lastP(l))}</div><div class="tiny">so'm/t</div></div></div>`).join('')}</div>`;
  else if (B.step === 2) body = `<h2 class="etitle">Qancha kerak?</h2><div class="muted">${esc(L.product)} · lotda ${fmt(L.supply)} t</div>
    <div class="eqty"><button data-dq="-1">−</button><div><div class="n" id="eq">${B.qty}</div><div class="tiny c">tonna</div></div><button data-dq="1">+</button></div>
    <div class="qchips">${[5, 10, 20, 50, 100].filter((x) => x <= L.supply).map((x) => `<button data-sq="${x}" class="${B.qty === x ? 'on' : ''}">${x} t</button>`).join('')}</div>
    <button class="btn lg" id="enext" style="width:100%;margin-top:24px">Davom etish</button>`;
  else if (B.step === 3) body = `<h2 class="etitle">Narx chegarasi</h2><div class="muted" style="margin-bottom:14px">Bu eng yuqori narx. G'oliblar yagona narxni to'laydi — odatda kamroq.</div>
    ${[['low', 'Tejamkor', 'Start narx. Arzon, lekin olmasligingiz mumkin'], ['normal', 'Odatiy', 'Oxirgi savdo kunlari darajasi'], ['high', 'Ishonchli', 'Olish ehtimoli eng yuqori']].map(([k, t, d]) => `<button class="eopt ${B.preset === k ? 'on' : ''}" data-pr="${k}"><span class="rad"></span><div style="flex:1"><b>${t}</b><small>${d}</small></div><b class="tnum">${fmt(B.prices[k])}</b></button>`).join('')}
    <div class="sum card pad" style="margin-top:6px"><div><span>Maksimal qiymat</span><b id="etot">${big(B.qty * B.prices[B.preset])} so'm</b></div></div>
    <button class="btn lg" id="enext" style="width:100%;margin-top:16px">Davom etish</button>`;
  else if (B.step === 4) { const p = B.prices[B.preset], max = B.qty * p; body = `<h2 class="etitle">Tasdiqlash</h2>
    <div class="card pad" style="margin:12px 0"><div class="prod" style="margin-bottom:10px"><div class="badge lg">${L.code}</div><div><b style="font-size:17px">${fmt(B.qty)} t · ${esc(L.product)}</b><small>${esc(L.grade)}</small></div></div>
      <div class="sum"><div><span>Narx chegarasi</span><b>${fmt(p)} so'm/t</b></div><div><span>Band qilinadi</span><b>${big(max + Math.ceil(max / 1000))} so'm</b></div><div><span>Sotuvchi</span><b class="ell" style="max-width:60%">${esc(L.seller)}</b></div><div><span>Yetkazish</span><b>${esc(L.delivery)}</b></div></div>
      <div class="note g" style="margin-top:12px">Yagona narx: g'oliblar bir xil to'laydi, farqi hisobingizga qaytadi.</div></div>
    <button class="hold" id="ehold"><span class="fb"></span><span>Tasdiqlash uchun bosib turing</span></button>`; }
  else body = '<div id="ewait"></div>';
  app.innerHTML = `<div class="easy">${easyHead()}${body}</div>`;
  const eb = $('#eback'); if (eb) eb.onclick = () => { B.step--; view.key = ''; render(); };
  app.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { B.lot = b.dataset.pick; B.qty = Math.min(10, S.lots.find((x) => x.id === B.lot).supply); B.step = 2; view.key = ''; render(); });
  const setQ = (q) => { B.qty = Math.max(1, Math.min(L.supply, q)); $('#eq').textContent = B.qty; app.querySelectorAll('[data-sq]').forEach((x) => x.classList.toggle('on', +x.dataset.sq === B.qty)); };
  app.querySelectorAll('[data-dq]').forEach((b) => b.onclick = () => setQ(B.qty + +b.dataset.dq));
  app.querySelectorAll('[data-sq]').forEach((b) => b.onclick = () => setQ(+b.dataset.sq));
  app.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { B.preset = b.dataset.pr; app.querySelectorAll('[data-pr]').forEach((x) => x.classList.toggle('on', x === b)); $('#etot').textContent = big(B.qty * B.prices[B.preset]) + " so'm"; });
  const nx = $('#enext');
  if (nx) nx.onclick = async () => { if (B.step === 2) { form.qty = B.qty; B.prices = await loadPresets(L); } B.step++; view.key = ''; render(); };
  const hold = $('#ehold');
  if (hold) {
    let t0 = 0, raf = 0, done = false; const fb = hold.querySelector('.fb');
    const stop = () => { if (!done) { cancelAnimationFrame(raf); fb.style.width = '0'; } };
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 800); fb.style.width = k * 100 + '%'; if (k < 1) raf = requestAnimationFrame(step); else { done = true; confirmEasy(); } };
    hold.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!done) { t0 = performance.now(); raf = requestAnimationFrame(step); } });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => hold.addEventListener(ev, stop));
    hold.addEventListener('keydown', (e) => { if (!done && (e.key === 'Enter' || e.key === ' ')) { done = true; confirmEasy(); } });
  }
  if (B.step === 5) easyWait();
}
async function placeEasy(L) {
  const r = await api('/api/orders', { lotId: L.id, buyer: BUYER, name: NAME, qty: B.qty, maxPrice: B.prices[B.preset], idemKey: `${BUYER}-${L.id}-${L.round}-easy` });
  if (r.ok) B.placed = { round: L.round, receipt: r.receipt }; else toast(r.reason);
  return r.ok;
}
async function confirmEasy() {
  const L = S.lots.find((l) => l.id === B.lot);
  if (L.phase !== 'open' || L.closesAt - nowS() < 1500) { B.retry = true; toast('Raund yopilmoqda — taklif keyingi raundga yuboriladi'); }
  else if (!(await placeEasy(L))) { view.key = ''; render(); return; }
  B.step = 5; view.key = ''; render();
}
async function easyWait() {
  const L = S.lots.find((l) => l.id === B.lot), box = $('#ewait'); if (!box) return;
  if (B.retry && L.phase === 'open' && L.closesAt - nowS() > 3000) { B.retry = false; await placeEasy(L); }
  const res = B.placed && S.mine.find((m) => m.lot === L.id && m.round === B.placed.round);
  const st = res ? 'done' : B.placed ? 'wait' : 'queued';
  if (box.dataset.s === st) return;
  box.dataset.s = st;
  if (st === 'done') {
    box.innerHTML = `<div class="c in"><div class="okmark ${res.x ? '' : 'no'}">${res.x ? '✓' : '↩'}</div><h2 class="etitle">${res.x ? `${fmt(res.x)} t sotib olindi` : 'Taklif yutmadi'}</h2>
      <div class="muted">${res.x ? `${esc(L.product)} · yagona narx ${fmt(res.price)} so'm/t` : 'Band qilingan mablag\' to\'liq qaytarildi'}</div></div>
      <div class="card pad" style="margin-top:16px"><div class="sum"><div><span>To'landi</span><b>${big(res.debit)} so'm</b></div><div><span>Qaytarildi</span><b class="up">${big(res.released)} so'm</b></div><div><span>Olib ketish</span><b>${esc(L.delivery)}</b></div></div></div>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn sec lg" style="flex:1" id="eagain">Yangi xarid</button><a class="btn lg" style="flex:1" href="#/lot/${L.id}">Protokol</a></div>`;
    $('#eagain').onclick = () => { Object.assign(B, { step: 1, lot: null, placed: null }); view.key = ''; render(); };
  } else {
    box.innerHTML = `<div class="c in"><div class="okmark">✓</div><h2 class="etitle">${st === 'queued' ? 'Navbatga qo\'yildi' : 'Taklif muhrlandi'}</h2><div class="muted">${st === 'queued' ? 'Keyingi raund ochilishi bilan yuboriladi' : 'Raund yopilishi bilan natija shu yerda chiqadi'}</div></div>
      <div class="card pad" style="margin-top:16px"><div class="sum"><div><span>${esc(L.product)}</span><b>${fmt(B.qty)} t</b></div><div><span>Narx chegarasi</span><b>${fmt(B.prices[B.preset])} so'm/t</b></div>
      <div data-timer="${L.id}"><span>Yopilishigacha</span><b data-tt>—</b></div>${B.placed ? `<div><span>Muhr</span><b class="mono">${B.placed.receipt.commit.slice(0, 14)}…</b></div>` : ''}</div></div>
      <div class="tiny c" style="margin-top:12px">Sahifani yopishingiz mumkin — natija Kabinetda saqlanadi.</div>`;
  }
}

// ---------- results ----------
function resultsPage() {
  const sig = 'res:' + S.results.length + ':' + (S.results[0]?.at ?? 0);
  if (view.key === sig) return; view.key = sig;
  const fmtT = (r) => r.src === 'live' ? 'Bugun ' + new Date(r.at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' }) : r.date;
  app.innerHTML = `<div class="ph"><div><h1>Natijalar reyestri</h1><div class="sub">Jonli raundlar va UZEX reyestridagi kunlik natijalar</div></div></div>
    <div class="card tbl res"><div class="tr h"><div>Sana</div><div>Tovar</div><div class="r">Narx, so'm/t</div><div class="r">Hajm</div><div class="r">Bitim/taklif</div><div class="r">Manba</div></div>
    ${S.results.map((r) => `<div class="tr click" data-go="${r.lot}"><div class="tnum">${fmtT(r)}</div><div class="prod"><div class="badge" style="width:30px;height:30px;font-size:11px">${r.icon}</div><b>${esc(r.product)}</b></div>
      <div class="r tnum">${r.price ? fmt(r.price) : '—'}</div><div class="r tnum hide-m">${fmt(r.traded)} t</div><div class="r tnum hide-m">${fmt(r.buyers)}</div><div class="r">${r.src === 'live' ? '<span class="chip g">Jonli</span>' : '<span class="chip">Reyestr</span>'}</div></div>`).join('')}</div>`;
  app.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => { location.hash = '#/lot/' + r.dataset.go; });
}

// ---------- account ----------
function mePage() {
  const open = S.lots.filter((l) => l.mine && l.phase === 'open');
  const sig = 'me:' + S.mine.length + ':' + S.wallet.reserved + ':' + open.length;
  if (view.key === sig) return; view.key = sig;
  const won = S.mine.filter((m) => m.x > 0);
  app.innerHTML = `<div class="ph"><div><h1>Kabinet</h1><div class="sub">${esc(NAME)} · demo hisob</div></div><button class="btn sec" id="mecall">AI agent qo'ng'iroq qilsin</button></div>
    <div class="card kpis" style="grid-template-columns:repeat(3,1fr)">
      <div><div class="k">Erkin mablag'</div><div class="v num">${big(S.wallet.balance - S.wallet.reserved)}</div><div class="s">so'm</div></div>
      <div><div class="k">Band qilingan</div><div class="v num">${big(S.wallet.reserved)}</div><div class="s">${open.length} ta ochiq taklif</div></div>
      <div><div class="k">Sotib olingan</div><div class="v num">${fmt(won.reduce((s, m) => s + m.x, 0))} t</div><div class="s">${won.length} ta bitim</div></div></div>
    <h3 style="margin:22px 0 10px">Ochiq takliflar</h3>
    ${open.length ? `<div class="card tbl my">${open.map((l) => `<div class="tr click" data-go="${l.id}"><div class="tnum">${l.id.toUpperCase()}-${l.round}</div><div class="prod"><div class="badge" style="width:30px;height:30px;font-size:11px">${l.code}</div><b>${esc(l.product)}</b></div><div class="r tnum">${fmt(l.mine.qty)} t</div><div class="r tnum">${fmt(l.mine.maxPrice)}</div><div class="r tnum hide-m">${big(l.mine.reserved)}</div><div class="r tnum" data-timer="${l.id}"><span data-tt>—</span></div></div>`).join('')}</div>` : '<div class="card empty">Ochiq taklif yo\'q · <a href="#/buy" class="up" style="font-weight:600">Xarid qilish</a></div>'}
    <h3 style="margin:22px 0 10px">Bitimlar</h3>
    <div class="card tbl my"><div class="tr h"><div>Raund</div><div>Tovar</div><div class="r">Oldim</div><div class="r">Narx</div><div class="r">To'landi</div><div class="r">Qaytdi</div></div>
    ${S.mine.length ? S.mine.map((m) => `<div class="tr click" data-go="${m.lot}"><div class="tnum">#${m.round}${m.via === 'phone' ? ' <span class="chip u">tel</span>' : ''}</div><div class="prod"><div class="badge" style="width:30px;height:30px;font-size:11px">${m.icon}</div><b>${esc(m.product)}</b></div>
      <div class="r tnum">${fmt(m.x)} / ${fmt(m.qty)} t</div><div class="r tnum">${m.x ? fmt(m.price) : '—'}</div><div class="r tnum hide-m">${big(m.debit)}</div><div class="r tnum up hide-m">${big(m.released)}</div></div>`).join('') : '<div class="empty">Hali bitim yo\'q</div>'}</div>`;
  $('#mecall').onclick = callModal;
  app.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => { location.hash = '#/lot/' + r.dataset.go; });
}

// ---------- call ----------
function callModal() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet"><h2 class="etitle">AI agent qo'ng'iroq qiladi</h2>
    <div class="muted" style="margin-bottom:14px">Telefon orqali o'zbek tilida taklif berasiz. Agent buyurtmani o'qib beradi va tasdiqlashingizni so'raydi.</div>
    <div class="lbl">Telefon raqami</div><div class="field"><span class="u" style="font-weight:600;color:var(--t2)">+998</span><input id="pn" inputmode="tel" placeholder="90 123 45 67" autocomplete="tel"></div>
    <div class="lbl" style="margin-top:12px">Ism yoki kompaniya</div><div class="field"><input id="nm" placeholder="Masalan: Navoiy Beton MChJ" value="${NAME === 'Mehmon' ? '' : esc(NAME)}" style="font-size:14px;font-weight:500"></div>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn sec lg" id="x" style="flex:1">Bekor</button><button class="btn lg" id="go" style="flex:2">Qo'ng'iroq qilish</button></div>
    <div class="tiny" style="margin-top:10px">Qo'ng'iroqni sun'iy intellekt amalga oshiradi. Siz uchun bepul.</div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.onclick = (e) => { if (e.target === m) close(); };
  $('#x', m).onclick = close; $('#pn', m).focus();
  $('#go', m).onclick = async () => {
    const nm = $('#nm', m).value.trim(); if (nm) { NAME = nm; store.set('aniq_name', nm); }
    const b = $('#go', m); b.disabled = true; b.textContent = 'Ulanmoqda…';
    const r = await api('/api/voice/call', { phone: $('#pn', m).value, buyer: BUYER, name: NAME });
    if (r.ok) { b.textContent = 'Telefoningiz jiringlaydi'; toast('Qo\'ng\'iroq boshlandi'); setTimeout(close, 2500); }
    else { b.disabled = false; b.textContent = 'Qayta urinish'; toast(r.notConfigured ? 'Ovozli agent ulanmagan' : r.reason); }
  };
}
$('#navcall').onclick = callModal;
poll();
