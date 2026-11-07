const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('ru-RU').replace(/ /g, ' '));
const mln = (n) => (n == null ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(2).replace('.', ',')} mlrd` : n >= 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')} mln` : fmt(n));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

let BUYER = store.get('aniq_buyer');
if (!BUYER) { BUYER = 'u-' + Math.random().toString(36).slice(2, 10); store.set('aniq_buyer', BUYER); }
let NAME = store.get('aniq_name') || 'Siz';

let S = null, skew = 0, view = { key: '' };
const nowS = () => Date.now() + skew;

async function api(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
function confetti() {
  const cols = ['#12b886', '#0b8a63', '#ffb547', '#0a66c2', '#1d1d1f'];
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('div'); c.className = 'confetti';
    c.style.left = innerWidth / 2 + 'px'; c.style.top = innerHeight * 0.35 + 'px'; c.style.background = cols[i % cols.length];
    c.style.setProperty('--x', `${(Math.random() - 0.5) * innerWidth * 0.9}px`); c.style.setProperty('--y', `${Math.random() * innerHeight * 0.7 - innerHeight * 0.1}px`); c.style.setProperty('--r', `${Math.random() * 900}deg`);
    c.style.animationDelay = `${Math.random() * 150}ms`; document.body.appendChild(c); setTimeout(() => c.remove(), 1900);
  }
}
function countUp(el, to, ms = 1000, f = mln) {
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = f(Math.round(to * e)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const ring = (frac, size = 54, sw = 5, color = '#12b886') => {
  const r = size / 2 - sw, c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#efeff2" stroke-width="${sw}" fill="none"/><circle class="p" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, frac)))}"/></svg>`;
};
const lotTime = (l) => l.phase === 'open' ? { left: l.closesAt - nowS(), frac: (l.closesAt - nowS()) / (l.closesAt - l.opensAt) } : { left: (l.revealUntil ?? 0) - nowS(), frac: 0 };

// ---------------- polling ----------------
async function poll() {
  try {
    const t0 = Date.now();
    const s = await api(`/api/state?buyer=${encodeURIComponent(BUYER)}`);
    skew = s.now - (t0 + Date.now()) / 2;
    S = s; render();
  } catch {}
  setTimeout(poll, 1000);
}
setInterval(() => { if (S) tickUI(); }, 250);
addEventListener('hashchange', () => { view.key = ''; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 8));

function render() {
  if (!S) return;
  $('#wbal').textContent = `${innerWidth < 560 ? '' : 'Hisob: '}${mln(S.wallet.balance - S.wallet.reserved)}${innerWidth < 560 ? '' : " so'm"}`;
  const h = location.hash || '#/';
  const tab = h.startsWith('#/buy') ? 'buy' : h.startsWith('#/lot') ? 'lots' : h.startsWith('#/results') ? 'results' : h.startsWith('#/me') ? 'me' : 'home';
  document.querySelectorAll('[data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === tab));
  paintQuotes();
  const m = h.match(/^#\/lot\/(\w+)/);
  if (m) return lotPage(m[1]);
  if (h.startsWith('#/lots')) return lotsPage();
  if (h.startsWith('#/results')) return resultsPage();
  if (h.startsWith('#/me')) return mePage();
  if (h.startsWith('#/buy')) return buyPage();
  return landing();
}
function tickUI() {
  document.querySelectorAll('[data-timer]').forEach((el) => {
    const l = S.lots.find((x) => x.id === el.dataset.timer); if (!l) return;
    const t = lotTime(l);
    el.querySelector('b').textContent = l.phase === 'open' ? mmss(t.left) : '✓';
    const p = el.querySelector('circle.p');
    if (p) { const c = +p.getAttribute('stroke-dasharray'); p.setAttribute('stroke-dashoffset', c * (1 - Math.max(0, t.frac))); }
  });
  document.querySelectorAll('[data-next]').forEach((el) => { const l = S.lots.find((x) => x.id === el.dataset.next); if (l) el.textContent = mmss(lotTime(l).left); });
  const c = $('#clock'); if (c) c.textContent = 'Toshkent ' + new Date(nowS()).toLocaleTimeString('uz-UZ', { hour12: false, timeZone: 'Asia/Tashkent' });
}

// ---------------- market helpers ----------------
const lastP = (l) => [...l.history].reverse().find((h) => h.price)?.price ?? null;
const chg = (l) => { const ps = l.history.filter((h) => h.price).map((h) => h.price); if (ps.length < 2) return null; return ps.at(-1) / ps.at(-2) - 1; };
const chgHtml = (c) => c == null ? '<span class="chg fl">—</span>' : `<span class="chg ${c > 0.0005 ? 'up' : c < -0.0005 ? 'dn' : 'fl'}">${c > 0.0005 ? '▲' : c < -0.0005 ? '▼' : '•'} ${Math.abs(c * 100).toFixed(2).replace('.', ',')}%</span>`;
const spark = (l, w = 90, h = 28) => {
  const ps = l.history.filter((x) => x.price).map((x) => x.price).slice(-12);
  if (ps.length < 2) return '';
  const lo = Math.min(...ps), hi = Math.max(...ps) || 1, span = hi - lo || 1;
  const pts = ps.map((p, i) => `${(i / (ps.length - 1)) * w},${h - 3 - ((p - lo) / span) * (h - 6)}`).join(' ');
  const c = chg(l) ?? 0, col = c < -0.0005 ? '#d70015' : '#12b886';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
};
function paintQuotes() {
  const html = S.lots.map((l) => `<a class="q" href="#/lot/${l.id}">${l.icon} ${esc(l.product)} <span class="p">${mln(lastP(l) ?? l.reserve)}</span>${chgHtml(chg(l))}</a>`).join('');
  const t = $('#qtrack'); if (t.dataset.h !== html) { t.dataset.h = html; t.innerHTML = html + html + html; }
}
let CAT = 'all', Q = '';
function lotRow(l, k) {
  const t = lotTime(l);
  return `<div class="trow in" style="--d:${k}" data-go="${l.id}">
    <div class="prod"><div class="em">${l.icon}</div><div style="min-width:0"><b>${esc(l.product)}</b><small>${esc(l.grade)} · ${esc(l.depot)}</small></div></div>
    <div class="hide-m"><small class="muted" style="font-size:12px">${esc(l.seller)}</small></div>
    <div class="r numv hide-m">${fmt(l.supply)} t</div>
    <div class="r numv hide-m">${mln(l.reserve)}</div>
    <div class="r"><div class="numv">${mln(lastP(l))}</div>${chgHtml(chg(l))}</div>
    <div class="hide-m" style="display:flex;justify-content:center">${spark(l)}</div>
    <div class="hide-m">${l.phase === 'open' ? `<span class="pill g"><span class="live"></span>${l.sealed} taklif</span>` : '<span class="pill">Natija</span>'}</div>
    <div class="tmini" style="justify-content:flex-end"><div class="cring" data-timer="${l.id}">${ring(t.frac, 38, 4)}<b>${l.phase === 'open' ? mmss(t.left) : '✓'}</b></div><button class="btn sm" style="height:34px;padding:0 12px">${l.mine ? 'Taklifim' : 'Kirish'}</button></div>
  </div>`;
}
function lotTable(list) {
  return `<div class="card tbl"><div class="trow h"><div>Tovar</div><div>Sotuvchi</div><div class="r">Hajm</div><div class="r">Minimal narx</div><div class="r">Oxirgi narx</div><div style="text-align:center">Dinamika</div><div>Holat</div><div class="r">Yopilish</div></div>
    ${list.length ? list.map(lotRow).join('') : '<div class="empty">Bu toifada lot yo\'q</div>'}</div>`;
}
function bindRows() { app.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => { location.hash = '#/lot/' + r.dataset.go; }); }
function paintTable(list) {
  const g = $('#lottable'); if (!g) return;
  const sig = list.map((l) => `${l.id}:${l.phase}:${l.round}:${l.sealed}:${!!l.mine}`).join('|') + CAT + Q;
  if (g.dataset.sig === sig) return;
  g.dataset.sig = sig; g.innerHTML = lotTable(list); bindRows();
}
const filtered = () => S.lots.filter((l) => (CAT === 'all' || l.cat === CAT) && (!Q || (l.product + l.grade + l.depot + l.seller).toLowerCase().includes(Q.toLowerCase())));
const catsHtml = () => `<div class="cats">${[['all', 'Hammasi'], ...Object.entries(S.categories)].map(([k, v]) => `<button data-cat="${k}" class="${CAT === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
function bindCats() {
  app.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { CAT = b.dataset.cat; app.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); paintTable(filtered()); });
  const s = $('#q'); if (s) s.oninput = () => { Q = s.value; paintTable(filtered()); };
}
function kpis() {
  const M = S.market;
  return `<div class="kpis">
    ${[['Savdo hajmi · 24 soat', M.turnover, 'so\'m', '💰'], ['Sotilgan tovar', M.tonnes, 'tonna', '📦'], ['Takliflar soni', M.bids, `${M.rounds} ta raundda`, '✉️'], ['Sotilgan ulushi', Math.round(M.sold * 1000) / 10, '% taklif qilingan hajmdan', '📈']]
      .map(([k, v, s, i], n) => `<div class="card kpi in" style="--d:${n}"><span class="ic">${i}</span><div class="k">${k}</div><div class="v" data-count="${v}" data-kind="${n === 3 ? 'pct' : n === 0 ? 'mln' : 'int'}">0</div><div class="s">${s}</div></div>`).join('')}
  </div>`;
}
function runKpis() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const k = el.dataset.kind, v = +el.dataset.count;
    countUp(el, k === 'pct' ? v * 10 : v, 1200, k === 'pct' ? (x) => (x / 10).toFixed(1).replace('.', ',') + '%' : k === 'mln' ? mln : fmt);
  });
}


// ---------------- Oson xarid (easy buy) ----------------
const B = { step: 1, lot: null, qty: 10, preset: 'normal', prices: null, placed: null };
function buyPage() {
  const key = `buy:${B.step}:${B.lot}:${B.step === 5 ? (S.lots.find((l) => l.id === B.lot)?.phase + ':' + S.lots.find((l) => l.id === B.lot)?.round) : ''}`;
  if (view.key === key) { if (B.step === 5) easyWaitTick(); return; }
  view.key = key;
  const L = S.lots.find((l) => l.id === B.lot);
  const dots = `<div class="edots">${[1, 2, 3, 4].map((i) => `<i class="${i <= Math.min(B.step, 4) ? 'on' : ''}"></i>`).join('')}</div>`;
  const back = B.step > 1 && B.step < 5 ? `<button class="eback" id="eback">←</button>` : '<span></span>';
  const head = (t, sub) => `<div class="ehead">${back}${dots}<span></span></div><h1 class="etitle in">${t}</h1>${sub ? `<p class="esub in" style="--d:1">${sub}</p>` : ''}`;
  let body = '';
  if (B.step === 1) {
    body = head('Nima kerak?', 'Tovarni tanlang') + `<div class="egrid">${S.lots.map((l, k) => `<button class="etile in" style="--d:${k}" data-pick="${l.id}"><span class="ei">${l.icon}</span><b>${esc(l.product)}</b><small>${mln(lastP(l) ?? l.reserve)} so'm/t</small></button>`).join('')}</div>`;
  } else if (B.step === 2) {
    body = head('Qancha kerak?', `${L.icon} ${esc(L.product)} · ${esc(L.depot)}`) + `
      <div class="eamount in" style="--d:2"><button class="eround" data-dq="-1">−</button><div><div class="ebig num" id="eqty">${B.qty}</div><div class="eunit">tonna</div></div><button class="eround" data-dq="1">+</button></div>
      <div class="echips in" style="--d:3">${[5, 10, 20, 50].filter((x) => x <= L.supply).map((x) => `<button data-sq="${x}" class="${B.qty === x ? 'on' : ''}">${x} t</button>`).join('')}</div>
      <div class="tiny" style="text-align:center;margin-top:10px">Lotda jami ${fmt(L.supply)} t</div>
      <button class="btn ebtn" id="enext">Davom etish →</button>`;
  } else if (B.step === 3) {
    const P = B.prices;
    const opts = [['low', '🐢', 'Tejamkor', 'Arzon, lekin olmasligingiz mumkin'], ['normal', '⚖️', 'Odatiy', 'Oxirgi savdolar darajasida'], ['high', '🚀', 'Albatta olay', 'Olish ehtimoli eng yuqori']];
    body = head('Qanchagacha to\'laysiz?', 'Bu — eng yuqori chegara. Odatda kamroq to\'laysiz.') + `
      <div class="eopts">${opts.map(([k, i, t, d], n) => `<button class="eopt in ${B.preset === k ? 'on' : ''}" style="--d:${n + 2}" data-pr="${k}"><span class="ei">${i}</span><div style="flex:1;text-align:left"><b>${t}</b><small>${d}</small></div><div class="num" style="font-weight:900">${mln(P[k])}</div></button>`).join('')}</div>
      <div class="etotal in" style="--d:5"><span>Ko'pi bilan</span><b class="num" id="etot">${mln(B.qty * P[B.preset])} so'm</b></div>
      <button class="btn ebtn" id="enext">Davom etish →</button>`;
  } else if (B.step === 4) {
    const price = B.prices[B.preset], max = B.qty * price, resv = max + Math.ceil(max / 1000);
    body = head('Tasdiqlang', '') + `
      <div class="card ereceipt in" style="--d:1">
        <div class="ei" style="font-size:44px">${L.icon}</div>
        <div class="ebig num" style="font-size:44px">${B.qty} t</div>
        <div class="muted" style="font-weight:700">${esc(L.product)} · ${esc(L.grade)}</div>
        <div class="erows">
          <div><span>Eng ko'pi bilan</span><b class="num">${fmt(price)} so'm/t</b></div>
          <div><span>Band qilinadi</span><b class="num">${mln(resv)} so'm</b></div>
          <div><span>Ombor</span><b>${esc(L.depot)}</b></div>
          <div><span>Yetkazish</span><b>${esc(L.delivery)}</b></div>
        </div>
        <div class="enote">⚖️ Hamma g'oliblar bir xil narx to'laydi. Ortiqcha pul avtomatik qaytadi.</div>
      </div>
      <button class="ehold in" style="--d:2" id="ehold"><span class="fillbar"></span><span class="lbl">Bosib turing — tasdiqlash</span></button>`;
  } else {
    body = `<div class="ehead"><span></span><span></span><span></span></div><div id="ewait"></div>`;
  }
  app.innerHTML = `<div class="easy">${body}</div>`;
  const eb = $('#eback'); if (eb) eb.onclick = () => { B.step--; view.key = ''; render(); };
  app.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { B.lot = b.dataset.pick; const l = S.lots.find((x) => x.id === B.lot); B.qty = Math.min(B.qty, l.supply); B.step = 2; view.key = ''; render(); });
  const setQ = (q) => { B.qty = Math.max(1, Math.min(L.supply, q)); $('#eqty').textContent = B.qty; app.querySelectorAll('[data-sq]').forEach((x) => x.classList.toggle('on', +x.dataset.sq === B.qty)); };
  app.querySelectorAll('[data-dq]').forEach((b) => b.onclick = () => setQ(B.qty + +b.dataset.dq));
  app.querySelectorAll('[data-sq]').forEach((b) => b.onclick = () => setQ(+b.dataset.sq));
  app.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { B.preset = b.dataset.pr; app.querySelectorAll('[data-pr]').forEach((x) => x.classList.toggle('on', x === b)); $('#etot').textContent = mln(B.qty * B.prices[B.preset]) + " so'm"; });
  const nx = $('#enext');
  if (nx) nx.onclick = async () => {
    if (B.step === 2) {
      const [lo, no, hi] = await Promise.all(['low', 'normal', 'high'].map((u) => api('/api/agent/suggest', { lotId: B.lot, need: B.qty, urgency: u })));
      const tk = L.tick * Math.max(1, Math.round(L.reserve / L.tick / 200));
      const normal = Math.max(no.maxPrice, lo.maxPrice + tk);
      B.prices = { low: lo.maxPrice, normal, high: Math.max(hi.maxPrice, normal + tk) };
    }
    B.step++; view.key = ''; render();
  };
  const hold = $('#ehold');
  if (hold) {
    let t0 = 0, raf = 0, done = false;
    const bar = hold.querySelector('.fillbar');
    const stop = () => { if (done) return; cancelAnimationFrame(raf); bar.style.width = '0%'; hold.classList.remove('holding'); };
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 900); bar.style.width = k * 100 + '%'; if (k < 1) raf = requestAnimationFrame(step); else { done = true; confirmEasy(); } };
    const start = (e) => { e.preventDefault(); if (done) return; t0 = performance.now(); hold.classList.add('holding'); raf = requestAnimationFrame(step); };
    hold.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => hold.addEventListener(ev, stop));
    hold.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { done = true; confirmEasy(); } });
  }
  if (B.step === 5) easyWaitTick(true);
}
async function confirmEasy() {
  const L = S.lots.find((l) => l.id === B.lot);
  if (L.phase !== 'open' || L.closesAt - nowS() < 1500) { toast('Bu raund yopilmoqda — keyingi raundga yuboramiz'); B.retry = true; }
  else {
    const r = await api('/api/orders', { lotId: L.id, buyer: BUYER, name: NAME, qty: B.qty, maxPrice: B.prices[B.preset], idemKey: `${BUYER}-${L.id}-${L.round}-easy` });
    if (!r.ok) { toast(r.reason); view.key = ''; render(); return; }
    B.placed = { round: L.round, receipt: r.receipt };
  }
  if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
  B.step = 5; view.key = ''; render();
}
async function easyWaitTick(first) {
  const L = S.lots.find((l) => l.id === B.lot), box = $('#ewait'); if (!box) return;
  if (B.retry && L.phase === 'open' && L.closesAt - nowS() > 3000) {
    B.retry = false;
    const r = await api('/api/orders', { lotId: L.id, buyer: BUYER, name: NAME, qty: B.qty, maxPrice: B.prices[B.preset], idemKey: `${BUYER}-${L.id}-${L.round}-easy` });
    if (r.ok) B.placed = { round: L.round, receipt: r.receipt }; else { toast(r.reason); return; }
  }
  const res = B.placed && S.mine.find((m) => m.lot === L.id && m.round === B.placed.round);
  const state = res ? 'done' : B.placed ? 'wait' : 'queued';
  if (box.dataset.s === state && state !== 'wait') return;
  if (box.dataset.s === 'wait' && state === 'wait') return;
  box.dataset.s = state;
  if (state === 'done') {
    box.innerHTML = `<div class="esuccess in"><div class="echeck ${res.x ? '' : 'grey'}">${res.x ? '✓' : '↩'}</div>
      <h1 class="etitle">${res.x ? `${fmt(res.x)} tonna sizniki!` : 'Bu safar olmadingiz'}</h1>
      <p class="esub">${res.x ? `${esc(L.product)} · narx ${fmt(res.price)} so'm/t — hamma uchun bir xil` : 'Band qilingan pul to\'liq qaytdi'}</p>
      <div class="card ereceipt" style="margin-top:18px"><div class="erows">
        <div><span>To'landi</span><b class="num">${mln(res.debit)} so'm</b></div>
        <div><span>Qaytdi</span><b class="num up">${mln(res.released)} so'm</b></div>
        <div><span>Olib ketish</span><b>${esc(L.depot)}</b></div></div></div>
      <div style="display:flex;gap:10px;margin-top:16px"><button class="btn ghost" style="flex:1" id="eagain">Yana xarid</button><a class="btn" style="flex:1" href="#/lot/${L.id}">Batafsil</a></div></div>`;
    if (res.x) setTimeout(confetti, 200);
    $('#eagain').onclick = () => { Object.assign(B, { step: 1, lot: null, placed: null }); view.key = ''; render(); };
  } else {
    box.innerHTML = `<div class="esuccess in"><div class="echeck">✓</div>
      <h1 class="etitle">Taklif muhrlandi</h1><p class="esub">${state === 'queued' ? 'Keyingi raund ochilishi bilan yuboriladi' : 'Raund yopilishi bilan natijani ko\'rsatamiz'}</p>
      <div class="bigring" data-timer="${L.id}" style="margin:18px auto">${ring(1, 200, 12)}<div class="t"><b>—</b><span class="muted">yopilishigacha</span></div></div>
      <div class="card ereceipt"><div class="erows"><div><span>${L.icon} ${esc(L.product)}</span><b>${B.qty} t</b></div><div><span>Eng ko'pi bilan</span><b class="num">${fmt(B.prices[B.preset])}</b></div>
      ${B.placed ? `<div><span>Muhr</span><b class="mono">#${B.placed.receipt.commit.slice(0, 10)}…</b></div>` : ''}</div></div>
      <p class="tiny" style="text-align:center;margin-top:12px">Sahifani yopsangiz ham bo'ladi — natija Kabinetda saqlanadi.</p></div>`;
  }
}

// ---------------- pages ----------------
function landing() {
  if (view.key !== 'home') {
    view.key = 'home';
    const soon = [...S.lots].filter((l) => l.phase === 'open').sort((a, b) => a.closesAt - b.closesAt)[0] || S.lots[0];
    app.innerHTML = `
    <section class="heroP">
      <div class="card lead in">
        <span class="pill g" style="width:max-content"><span class="live"></span>UZEX 2035 · AI agentlar davri</span>
        <h1 style="margin-top:16px">Tezlik emas.<br><span class="gr">Adolat.</span></h1>
        <p>Yashirin takliflar, bitta umumiy narx, avtomatik isbot. Millisekundlar hech narsani hal qilmaydi — narx va ehtiyoj hal qiladi.</p>
        <div class="ctas" style="justify-content:flex-start"><a class="btn" href="#/buy">⚡ Oson xarid — 4 qadam</a><a class="btn ghost" href="#/lots">Professional rejim</a><button class="btn ghost" data-call>📞 Qo'ng'iroq</button></div>
        <div class="badges"><span class="pill">🔒 Muhrlangan takliflar</span><span class="pill">⚖️ Yagona narx</span><span class="pill">🔀 Tartibdan mustaqil</span><span class="pill">🧾 Tekshiriladigan protokol</span></div>
      </div>
      <a class="card next in" style="--d:1" href="#/lot/${soon.id}">
        <div class="label" style="margin:0">Eng yaqin yopilish</div>
        <div class="row"><div class="em" style="width:54px;height:54px;border-radius:16px;display:grid;place-items:center;font-size:28px;background:var(--soft)">${soon.icon}</div>
          <div style="flex:1"><div style="font-weight:800;font-size:19px">${esc(soon.product)}</div><div class="muted" style="font-size:13px">${esc(soon.grade)} · ${fmt(soon.supply)} t</div></div></div>
        <div class="bigring" data-timer="${soon.id}" style="width:170px;height:170px;margin:4px auto">${ring(1, 170, 11)}<div class="t"><b style="font-size:38px">—</b><span class="muted">yopilishigacha</span></div></div>
        <div class="kv" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div class="tiny">Minimal narx</div><b class="num">${mln(soon.reserve)}</b></div><div><div class="tiny">Oxirgi narx</div><b class="num">${mln(lastP(soon))}</b></div></div>
        <span class="btn" style="width:100%">Taklif berish →</span>
      </a>
    </section>
    ${kpis()}
    <div class="sec-h" style="margin:26px 0 12px"><h2>Bugungi savdolar</h2><a class="navlink" href="#/results">Natijalar reyestri →</a></div>
    <div class="toolbar">${catsHtml()}</div>
    <div id="lottable"></div>
    <div class="steps3" style="margin-top:34px">
      ${[['🔒', 'Muhrlang', 'Necha tonna va eng ko\'pi bilan qancha. Boshqalar ko\'rmaydi.'], ['⏳', 'Teng kuting', 'Oyna yopilguncha hamma taklif teng. Birinchi bo\'lish ustunlik bermaydi.'], ['⚖️', 'Bir xil narx', 'Yuqori narx ustun. G\'oliblar bir xil narx to\'laydi, ortig\'i qaytadi.']]
        .map(([i, b, p], k) => `<div class="card st"><span class="n">${k + 1}</span><div class="ic" style="--d:${k}">${i}</div><b>${b}</b><p>${p}</p></div>`).join('')}
    </div>`;
    app.querySelector('[data-call]').onclick = (e) => { e.preventDefault(); callModal(); };
    bindCats(); runKpis();
  }
  paintTable(filtered());
}
function lotsPage() {
  if (view.key !== 'lots') {
    view.key = 'lots';
    app.innerHTML = `<div class="page-h"><div><h1 class="in">Savdolar</h1><div class="muted in" style="--d:1;margin-top:6px">Har bir lot — bitta sotuvchi, standart tovar, qisqa yashirin raund.</div></div><button class="btn ghost sm" data-call>📞 Telefon orqali taklif</button></div>
      <div class="toolbar"><div class="search">🔎<input id="q" placeholder="Tovar, ombor yoki sotuvchi…" value="${esc(Q)}"></div>${catsHtml()}</div>
      <div id="lottable"></div>`;
    app.querySelector('[data-call]').onclick = callModal; bindCats();
  }
  paintTable(filtered());
}
function resultsPage() {
  const sig = 'results:' + S.results.length + ':' + (S.results[0]?.at ?? 0);
  if (view.key === sig) return;
  view.key = sig;
  const rows = S.results.slice(0, 40).map((r, k) => {
    const pct = r.supply ? r.traded / r.supply : 0;
    return `<div class="trow rrow ${k < 12 ? 'in' : ''}" style="--d:${k}" data-go="${r.lot}">
      <div class="muted" style="font-size:13px">${new Date(r.at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' })}${r.demo ? ' <span class="tiny">demo</span>' : ''}</div>
      <div class="prod"><div class="em" style="width:34px;height:34px;font-size:18px">${r.icon}</div><b>${esc(r.product)}</b></div>
      <div class="r numv">${r.price ? mln(r.price) : '—'}</div>
      <div class="r numv hide-m">${fmt(r.traded)} t</div>
      <div class="hide-m"><div class="bar" style="height:8px"><i style="width:${pct * 100}%;background:var(--em2)"></i></div><div class="tiny">${Math.round(pct * 100)}% sotildi</div></div>
      <div class="r hide-m">${fmt(r.demand)} t talab</div>
      <div class="r hide-m">${r.buyers} ta</div></div>`;
  }).join('');
  app.innerHTML = `<div class="page-h"><div><h1 class="in">Natijalar reyestri</h1><div class="muted in" style="--d:1;margin-top:6px">Har bir raund yopilgach — narx, hajm va qatnashchilar. Har bir yozuv tekshiriladi.</div></div></div>
    ${kpis()}
    <div class="card tbl"><div class="trow rrow h"><div>Vaqt</div><div>Tovar</div><div class="r">Narx / t</div><div class="r">Sotildi</div><div>Ulush</div><div class="r">Talab</div><div class="r">Takliflar</div></div>${rows || '<div class="empty">Hali natija yo\'q</div>'}</div>`;
  bindRows(); runKpis();
}
function mePage() {
  const sig = 'me:' + S.mine.length + ':' + S.wallet.reserved + ':' + S.lots.filter((l) => l.mine).length;
  if (view.key === sig) return;
  view.key = sig;
  const open = S.lots.filter((l) => l.mine && l.phase === 'open');
  const won = S.mine.filter((m) => m.x > 0);
  app.innerHTML = `<div class="page-h"><div><h1 class="in">Kabinet</h1><div class="muted in" style="--d:1;margin-top:6px">${esc(NAME)} · demo hisob</div></div><button class="btn sm" data-call>📞 AI qo'ng'iroq qilsin</button></div>
    <div class="wcards">
      <div class="card kpi in"><span class="ic">💳</span><div class="k">Erkin mablag'</div><div class="v">${mln(S.wallet.balance - S.wallet.reserved)}</div><div class="s">so'm</div></div>
      <div class="card kpi in" style="--d:1"><span class="ic">🔒</span><div class="k">Band qilingan</div><div class="v">${mln(S.wallet.reserved)}</div><div class="s">${open.length} ta ochiq taklif</div></div>
      <div class="card kpi in" style="--d:2"><span class="ic">📦</span><div class="k">Sotib olingan</div><div class="v">${fmt(won.reduce((s, m) => s + m.x, 0))} t</div><div class="s">${won.length} ta bitim</div></div>
    </div>
    <div class="sec-h" style="margin:10px 0 12px"><h2 style="font-size:22px">Ochiq takliflarim</h2></div>
    ${open.length ? lotTable(open) : '<div class="card empty">Ochiq taklif yo\'q. <a href="#/lots" style="color:var(--em);font-weight:700">Savdoga kirish →</a></div>'}
    <div class="sec-h" style="margin:26px 0 12px"><h2 style="font-size:22px">Bitimlarim</h2></div>
    <div class="card tbl"><div class="trow mrow h"><div>Raund</div><div>Tovar</div><div class="r">Oldim</div><div class="r">Narx</div><div class="r">To'landi</div><div class="r">Qaytdi</div></div>
      ${S.mine.length ? S.mine.map((m) => `<div class="trow mrow" data-go="${m.lot}"><div class="muted">#${m.round}${m.via === 'phone' ? ' 📞' : ''}</div><div class="prod"><div class="em" style="width:34px;height:34px;font-size:18px">${m.icon}</div><b>${esc(m.product)}</b></div>
        <div class="r numv" style="color:${m.x ? 'var(--em)' : 'var(--faint)'}">${fmt(m.x)} / ${fmt(m.qty)} t</div><div class="r numv">${m.x ? mln(m.price) : '—'}</div><div class="r numv">${mln(m.debit)}</div><div class="r numv up">${mln(m.released)}</div></div>`).join('') : '<div class="empty">Hali bitim yo\'q</div>'}</div>`;
  app.querySelectorAll('[data-call]').forEach((b) => b.onclick = callModal);
  bindRows();
  if (open.length) app.querySelectorAll('#app .trow').forEach(() => {});
}

// ---------------- lot page ----------------
const form = { qty: null, price: null, urgency: 'normal' };
function lotPage(id) {
  const l = S.lots.find((x) => x.id === id);
  if (!l) { app.innerHTML = '<p class="muted" style="margin-top:40px">Lot topilmadi.</p>'; return; }
  const key = `lot:${id}:${l.phase}:${l.round}`;
  if (view.key !== key) {
    const prevPhase = view.key.startsWith(`lot:${id}:open`) ? 'open' : null;
    view.key = key;
    if (l.phase === 'open') openView(l); else revealView(l, prevPhase === 'open');
  }
  if (l.phase === 'open') updateOpen(l);
}


function termsGrid(l) {
  const items = [['Sotuvchi', l.seller], ['Ombor', l.depot], ['Sinf / navi', l.grade], ['Hajm', fmt(l.supply) + ' tonna'], ['Minimal narx', fmt(l.reserve) + " so'm/t"], ['Narx qadami', fmt(l.tick) + " so'm"], ['Yetkazish', l.delivery], ['Qoida', S.rule]];
  return `<div class="terms in" style="--d:1">${items.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>`;
}
function historyChart(l) {
  const H = l.history.filter((h) => h.price).slice(-14);
  if (H.length < 2) return '<div class="muted">Hali tarix yo\'q</div>';
  const W = 520, Ht = 170, pad = 8;
  const ps = H.map((h) => h.price), lo = Math.min(...ps, l.reserve) * 0.995, hi = Math.max(...ps) * 1.005;
  const x = (i) => pad + (i / (H.length - 1)) * (W - pad * 2), y = (p) => 110 - ((p - lo) / (hi - lo || 1)) * 96;
  const maxV = Math.max(...H.map((h) => h.demand), 1);
  const line = H.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.price).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${Ht}" width="100%">
    <line x1="0" x2="${W}" y1="${y(l.reserve)}" y2="${y(l.reserve)}" stroke="#bfe6d6" stroke-dasharray="4 5"/>
    <text x="${W - 4}" y="${y(l.reserve) - 4}" font-size="10" fill="#0b8a63" text-anchor="end">minimal narx</text>
    ${H.map((h, i) => `<rect x="${x(i) - 7}" y="${Ht - 4 - (h.traded / maxV) * 40}" width="14" height="${(h.traded / maxV) * 40}" rx="3" fill="#e7f6f0"/><rect x="${x(i) - 7}" y="${Ht - 4 - (h.demand / maxV) * 40}" width="14" height="${Math.max(0, (h.demand - h.traded) / maxV * 40)}" rx="3" fill="#f5f5f7"/>`).join('')}
    <path class="ln" d="${line}" fill="none" stroke="#12b886" stroke-width="2.5" stroke-linejoin="round"/>
    ${H.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.price)}" r="${i === H.length - 1 ? 4.5 : 2.5}" fill="${i === H.length - 1 ? '#0b8a63' : '#12b886'}"><title>Raund ${h.round}: ${fmt(h.price)} so'm · ${h.traded} t</title></circle>`).join('')}
  </svg>
  <div style="display:flex;justify-content:space-between" class="tiny"><span>${H.length} raund</span><span>Chiziq — narx · ustun — sotilgan / talab</span></div>`;
}
function chartCard(l) {
  return `<div class="card chart"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="label" style="margin:0">Narx tarixi</div><div>${chgHtml(chg(l))}</div></div>${historyChart(l)}</div>`;
}

function openView(l) {
  form.qty = l.mine?.qty ?? Math.max(1, Math.round(l.supply / 5));
  form.price = l.mine?.maxPrice ?? l.reserve;
  const pMax = l.reserve + l.tick * Math.max(20, Math.round(l.reserve * 0.12 / l.tick));
  app.innerHTML = `
  <a class="back" href="#/lots">← Savdolar</a>
  <div class="lothead in"><div class="em">${l.icon}</div><div style="flex:1"><h1>${esc(l.product)}</h1><div class="muted">${esc(l.grade)} · ${esc(l.depot)} · ${fmt(l.supply)} tonna · raund ${l.round}</div></div><span class="pill g"><span class="live"></span>Ochiq</span></div>
  ${termsGrid(l)}
  <div class="grid2">
    <div>
      <div class="card in" style="--d:1">
        <div class="label">Sizning taklifingiz</div>
        <div class="slider"><div class="row"><span class="muted" style="font-weight:600">Necha tonna kerak?</span><div class="steppers"><button data-q="-1">−</button><button data-q="1">+</button></div></div>
          <div><span class="big num" id="qv"></span><span class="unit">tonna</span></div>
          <input type="range" id="qr" min="1" max="${l.supply}" step="1"></div>
        <div class="slider"><div class="row"><span class="muted" style="font-weight:600">Eng ko'pi bilan, so'm / tonna</span><div class="steppers"><button data-p="-1">−</button><button data-p="1">+</button></div></div>
          <div><span class="big num" id="pv"></span><span class="unit">so'm</span></div>
          <input type="range" id="pr" min="${l.reserve - l.tick * 5}" max="${pMax}" step="${l.tick}">
          <div class="tiny" id="pnote"></div></div>
        <div class="sum"><div><div class="tiny">Band qilinadi</div><div class="v num" id="resv"></div></div><div><div class="tiny">Ko'pi bilan to'lov</div><div class="v num" id="maxpay"></div></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="seal" style="flex:1">🔒 Taklifni muhrlash</button><button class="btn ghost" id="cancel" style="display:none">Bekor qilish</button></div>
        <div class="agent">
          <div class="hd"><span class="bot">🤖</span>AI agent maslahati</div>
          <div class="chips" id="urg">${[['low', 'Shoshilmayman'], ['normal', 'Odatiy'], ['high', 'Juda shoshilinch']].map(([v, t]) => `<button class="chip ${form.urgency === v ? 'on' : ''}" data-u="${v}">${t}</button>`).join('')}</div>
          <button class="btn dark sm" id="ask">Maslahat ber</button>
          <div id="advice"></div>
        </div>
      </div>
    </div>
    <div class="side">
      <div class="card in" style="--d:2;text-align:center">
        <div class="bigring" data-timer="${l.id}">${ring(1, 200, 12)}<div class="t"><b>—</b><span class="muted">yopilishigacha</span></div></div>
        <div style="font-weight:800" id="sealedct"></div>
        <div class="envbox" id="envbox"></div>
        <div class="tiny" style="margin-top:12px">Takliflar summasi yopilguncha hech kimga ko'rinmaydi.</div>
      </div>
      <div id="rcpt"></div>
      ${chartCard(l)}
    </div>
  </div>`;
  const qr = $('#qr'), pr = $('#pr');
  const paint = () => {
    qr.value = form.qty; pr.value = form.price;
    qr.style.setProperty('--p', `${((form.qty - 1) / (l.supply - 1)) * 100}%`);
    pr.style.setProperty('--p', `${((form.price - +pr.min) / (+pr.max - +pr.min)) * 100}%`);
    $('#qv').textContent = fmt(form.qty); $('#pv').textContent = fmt(form.price);
    const maxpay = form.qty * form.price;
    $('#maxpay').textContent = mln(maxpay) + ' so\'m'; $('#resv').textContent = mln(maxpay + Math.ceil(maxpay / 1000)) + ' so\'m';
    $('#pnote').innerHTML = form.price < l.reserve ? '<span style="color:var(--red)">Minimal narxdan past — bu taklif savdoga kirmaydi</span>' : `Minimal narx: ${fmt(l.reserve)} · qadam: ${fmt(l.tick)}`;
  };
  qr.oninput = () => { form.qty = +qr.value; paint(); };
  pr.oninput = () => { form.price = +pr.value; paint(); };
  app.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { form.qty = Math.min(l.supply, Math.max(1, form.qty + +b.dataset.q)); paint(); });
  app.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { form.price = Math.min(+pr.max, Math.max(+pr.min, form.price + +b.dataset.p * l.tick)); paint(); });
  app.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { form.urgency = b.dataset.u; app.querySelectorAll('[data-u]').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#ask').onclick = async () => {
    const r = await api('/api/agent/suggest', { lotId: l.id, need: form.qty, urgency: form.urgency });
    if (!r.ok) return toast(r.reason);
    $('#advice').innerHTML = `<div style="margin-top:12px;padding:12px;border-radius:14px;background:#fff;box-shadow:var(--shadow);animation:pop .4s both">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><b class="num">${fmt(r.qty)} t · ${fmt(r.maxPrice)} so'm gacha</b><button class="btn sm" id="apply">Qo'llash</button></div>
      <ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    $('#apply').onclick = () => { form.qty = r.qty; form.price = Math.min(+pr.max, r.maxPrice); paint(); toast('Agent maslahati qo\'llandi'); };
  };
  $('#seal').onclick = async () => {
    const r = await api('/api/orders', { lotId: l.id, buyer: BUYER, name: NAME, qty: form.qty, maxPrice: form.price, idemKey: `${BUYER}-${l.id}-${l.round}-${form.qty}-${form.price}` });
    if (!r.ok) return toast(r.reason);
    sealAnimation(); S.lots.find((x) => x.id === l.id).mine = { qty: form.qty, maxPrice: form.price, version: r.receipt.version, reserved: r.receipt.reserved };
    showReceipt(l, r.receipt); updateOpen(S.lots.find((x) => x.id === l.id));
  };
  $('#cancel').onclick = async () => {
    const r = await api('/api/orders', { lotId: l.id, buyer: BUYER }, 'DELETE');
    if (r.ok) { S.lots.find((x) => x.id === l.id).mine = null; $('#rcpt').innerHTML = ''; toast('Taklif bekor qilindi, pul bo\'shatildi'); updateOpen(S.lots.find((x) => x.id === l.id)); } else toast(r.reason);
  };
  paint();
  if (l.mine) showReceipt(l, { version: l.mine.version, reserved: l.mine.reserved });
}
function showReceipt(l, rc) {
  $('#rcpt').innerHTML = `<div class="receipt"><div class="hd">✓ Taklif muhrlandi${rc.version > 1 ? ` · ${rc.version}-versiya` : ''}</div>
    <div class="muted" style="margin-top:6px">${fmt(S.lots.find((x) => x.id === l.id).mine?.qty ?? form.qty)} t · ${fmt(S.lots.find((x) => x.id === l.id).mine?.maxPrice ?? form.price)} so'm gacha · band: ${mln(rc.reserved)}</div>
    ${rc.commit ? `<div class="mono tiny" style="margin-top:8px">muhr #${rc.commit.slice(0, 16)}…</div>` : ''}</div>`;
}
function updateOpen(l) {
  const box = $('#envbox'); if (!box) return;
  const n = l.sealed;
  if (+box.dataset.n !== n) {
    const have = box.children.length;
    for (let i = have; i < n; i++) box.insertAdjacentHTML('beforeend', '<div class="env"></div>');
    while (box.children.length > n) box.lastChild.remove();
    box.dataset.n = n;
  }
  $('#sealedct').textContent = n ? `${n} ta muhrlangan taklif` : 'Hali taklif yo\'q';
  $('#seal').textContent = l.mine ? '🔁 Taklifni yangilash' : '🔒 Taklifni muhrlash';
  $('#cancel').style.display = l.mine ? '' : 'none';
}
function sealAnimation() {
  const o = document.createElement('div'); o.className = 'sealanim';
  o.innerHTML = `<div style="text-align:center"><div class="bigenv"><div class="flap"></div><div class="wax">✓</div></div><div style="margin-top:22px;font-weight:800;font-size:20px;animation:up .4s .8s both">Muhrlandi. Hech kim ko'rmaydi.</div></div>`;
  document.body.appendChild(o); setTimeout(() => { o.style.transition = 'opacity .3s'; o.style.opacity = 0; }, 1500); setTimeout(() => o.remove(), 1850);
}

function revealView(l, justClosed) {
  const L = l.last;
  if (!L) { app.innerHTML = '<p class="muted">Natija tayyorlanmoqda…</p>'; return; }
  const me = L.bids.find((b) => b.me);
  const P = L.price;
  const colors = ['#0b8a63', '#12b886', '#3cc79a', '#6fd6b2', '#9fe3c9', '#0a66c2', '#5b9bd8'];
  const winners = L.bids.filter((b) => b.x > 0);
  const lines = [];
  let cutShown = false, loseShown = false;
  L.bids.forEach((b, k) => {
    if (P && b.maxPrice === P && !cutShown && L.cutoff) { cutShown = true; lines.push(`<div class="cutline">Umumiy narx · ${fmt(P)} — shu narxdagilar qolganini ulushga bo'lishadi</div>`); }
    if (b.x === 0 && !loseShown && winners.length) { loseShown = true; if (!cutShown) lines.push(`<div class="cutline" style="color:var(--mute)">Shu yerdan pastda — olmadi</div>`); }
    const full = b.x === b.qty, part = b.x > 0 && !full;
    const col = full ? 'var(--em2)' : part ? '#f0a23c' : 'var(--line2)';
    lines.push(`<div class="bidrow ${b.me ? 'me' : ''}" style="--d:${k}">
      <div class="nm">${b.me ? '🧑‍💼 ' : b.via === 'phone' ? '📞 ' : '🤖 '}${esc(b.name)}${b.me ? ' <span class="pill b">Siz</span>' : ''}</div>
      <div class="num" style="font-weight:700">${mln(b.maxPrice)}</div>
      <div class="bx"><div class="bar"><i style="--d:${k};width:${(b.x / b.qty) * 100}%;background:${col}"></i></div><div class="tiny" style="margin-top:4px">so'radi ${fmt(b.qty)} t</div></div>
      <div class="num xr" style="text-align:right;font-weight:800;color:${b.x ? 'var(--ink)' : 'var(--faint)'}">${fmt(b.x)} t</div></div>`);
  });
  app.innerHTML = `
  <a class="back" href="#/lots">← Savdolar</a>
  <div class="lothead in"><div class="em">${l.icon}</div><div style="flex:1"><h1>${esc(l.product)}</h1><div class="muted">Raund ${L.round} yakunlandi · keyingisi <b data-next="${l.id}">—</b> dan keyin</div></div><span class="pill">Natija</span></div>
  <div class="grid2">
    <div class="reveal">
      <div class="pricebadge">${P ? `<div class="muted" style="font-weight:700">Hamma g'oliblar uchun bir xil narx</div><div class="big num" id="pbig">0</div><div class="muted">so'm / tonna · ${fmt(L.traded)} / ${fmt(l.supply)} t sotildi · talab ${fmt(L.demand)} t</div>`
        : `<div class="big">Savdo bo'lmadi</div><div class="muted">Minimal narxga yetgan taklif bo'lmadi. Pullar to'liq qaytarildi.</div>`}</div>
      ${me ? `<div class="yourres ${me.x ? 'win' : 'lose'}"><div class="ic">${me.x ? '🎉' : '🤝'}</div><div><div class="t">${me.x ? `Siz ${fmt(me.x)} tonna oldingiz` : 'Bu safar olmadingiz'}</div>
        <div class="muted">${me.x ? `${mln(me.debit)} so'm to'landi · <b style="color:var(--em)">${mln(me.released)} so'm qaytdi</b> — chegarangizdan arzon` : 'Band qilingan pul to\'liq qaytarildi. Keyingi raund tez orada.'}</div></div></div>` : ''}
      <div class="card"><div class="label">Kim qancha oldi</div>
        <div class="supplybar">${winners.map((b, k) => `<span style="width:${(b.x / l.supply) * 100}%;background:${b.me ? '#0a66c2' : colors[k % colors.length]};animation-delay:${k * 120}ms" title="${esc(b.name)}">${b.x / l.supply > 0.09 ? fmt(b.x) + ' t' : ''}</span>`).join('')}</div>
        <div class="tiny" style="margin-bottom:10px">${fmt(l.supply)} tonna · ${L.unsold ? fmt(L.unsold) + ' t sotilmadi' : 'hammasi taqsimlandi'}</div>
        ${lines.join('')}</div>
    </div>
    <div class="side">
      <div class="card proof"><div class="label">Adolat isboti</div>
        <div class="muted" style="margin-bottom:10px">Takliflar kelish tartibini aralashtirib, natijani qayta hisoblaymiz.</div>
        <button class="btn dark" id="verify" style="width:100%">🔀 Aralashtirib qayta hisoblash</button>
        <div id="vres"></div></div>
      <div class="card"><div class="label">Qanday hisoblandi</div>
        <div class="muted" style="line-height:1.6">${L.kind === 'over' ? `Talab (${fmt(L.demand)} t) hajmdan ko'p. Eng yuqori narxlar birinchi to'ldi. ${fmt(l.supply)}-tonnaga to'g'ri kelgan narx — <b>${fmt(P)}</b> — hamma uchun narx bo'ldi.` : L.kind === 'under' ? `Talab (${fmt(L.demand)} t) hajmdan kam — hamma so'raganini <b>minimal narxda</b> oldi.` : 'Minimal narxga yetgan taklif bo\'lmadi.'}</div>
        <div class="mono tiny" style="margin-top:10px">qoida ${esc(S.rule)} · yozuv #${L.recordHash.slice(0, 14)}…</div></div>
      <div class="card proto"><div class="label">Savdo protokoli</div>
        ${[['Lot', `${l.id.toUpperCase()} · raund ${L.round}`], ['Tovar', `${l.product}, ${l.grade}`], ['Sotuvchi', l.seller], ['Taklif etildi', fmt(l.supply) + ' t'], ['Talab', fmt(L.demand) + ' t'], ['Sotildi', `${fmt(L.traded)} t (${Math.round(L.traded / l.supply * 100)}%)`], ['Yagona narx', P ? fmt(P) + " so'm/t" : '—'], ['Savdo summasi', P ? mln(P * L.traded) + " so'm" : '—'], ['Takliflar', L.bids.length + ' ta'], ['Urug\' xeshi', L.seedHash.slice(0, 12) + '…'], ['Yozuv', '#' + L.recordHash.slice(0, 12) + '…']]
          .map(([k, v]) => `<div class="pr"><span>${k}</span><span class="num">${esc(v)}</span></div>`).join('')}</div>
      ${chartCard(l)}
      <button class="btn ghost" data-call>📞 Natijani qo'ng'iroqda eshitish</button>
    </div>
  </div>`;
  if (P) countUp($('#pbig'), P, 1100, fmt);
  if (justClosed && me?.x) setTimeout(confetti, 500);
  app.querySelectorAll('[data-call]').forEach((b) => b.onclick = callModal);
  $('#verify').onclick = async () => {
    const r = await api('/api/verify', { lotId: l.id });
    if (!r.ok) return toast(r.reason);
    $('#vres').innerHTML = `<div class="shuffle">${r.shuffledOrder.map((n, k) => `<span style="--d:${k}">${esc(n)}</span>`).join('')}</div>
      ${[[true, 'Kelish tartibi aralashtirildi'], [r.sameResult, `Natija aynan bir xil — ${r.price ? fmt(r.price) + ' so\'m' : 'savdo yo\'q'}`], [r.seedMatches, 'Qur\'a urug\'i oldindan e\'lon qilingan xeshga mos'], [r.recordIntact, 'Yozuv o\'zgartirilmagan']]
        .map(([ok, t], k) => `<div class="chk ${ok ? 'ok' : ''}" style="animation:up .4s ${k * 250}ms both"><span class="o" style="animation-delay:${k * 250}ms">${ok ? '✓' : '✗'}</span>${t}</div>`).join('')}`;
  };
}

// ---------------- call modal ----------------
function callModal() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet"><div class="phone" id="ph"><span>📞</span></div>
    <h2 style="font-size:24px">AI agent sizga qo'ng'iroq qiladi</h2>
    <p class="muted" style="margin:8px 0 4px">Raqamingizni yozing — telefoningiz jiringlaydi. Agent o'zbek tilida taklifingizni qabul qiladi.</p>
    <div class="field"><span class="pre">+998</span><input id="pn" inputmode="tel" placeholder="90 123 45 67" autocomplete="tel"></div>
    <div class="field" style="height:48px"><input id="nm" placeholder="Ismingiz yoki kompaniya" style="font-size:16px;font-weight:600" value="${NAME === 'Siz' ? '' : esc(NAME)}"></div>
    <button class="btn" id="go" style="width:100%">Qo'ng'iroq qilsin</button>
    <button class="btn ghost sm" id="x" style="margin-top:10px">Yopish</button>
    <div class="tiny" style="margin-top:12px">Qo'ng'iroq AI tomonidan amalga oshiriladi. Siz uchun bepul.</div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.onclick = (e) => { if (e.target === m) close(); };
  $('#x', m).onclick = close;
  $('#pn', m).focus();
  $('#go', m).onclick = async () => {
    const nm = $('#nm', m).value.trim(); if (nm) { NAME = nm; store.set('aniq_name', nm); }
    $('#ph', m).classList.add('ringing'); $('#go', m).disabled = true; $('#go', m).textContent = 'Ulanmoqda…';
    const r = await api('/api/voice/call', { phone: $('#pn', m).value, buyer: BUYER, name: NAME });
    if (r.ok) { $('#go', m).textContent = 'Telefoningiz jiringlayapti…'; toast('📞 Qo\'ng\'iroq yo\'lda!'); }
    else { $('#ph', m).classList.remove('ringing'); $('#go', m).disabled = false; $('#go', m).textContent = 'Qayta urinish'; toast(r.notConfigured ? 'Ovozli agent hali ulanmagan — kalitlar qo\'shilgach ishlaydi' : r.reason); }
  };
}

$('#navcall').onclick = callModal;
poll();
