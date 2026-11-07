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
  $('#nl-lots').classList.toggle('on', h.startsWith('#/lot'));
  const m = h.match(/^#\/lot\/(\w+)/);
  if (m) return lotPage(m[1]);
  if (h.startsWith('#/lots')) return lotsPage();
  return landing(h.startsWith('#/how'));
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
}

// ---------------- landing ----------------
function lotCard(l, k = 0, anim = true) {
  const t = lotTime(l);
  return `<a class="card lot ${anim ? 'in' : ''}" style="--d:${k}" href="#/lot/${l.id}">
    <div class="top"><div class="em">${l.icon}</div><div style="flex:1;min-width:0"><div class="nm">${esc(l.product)}</div><div class="muted" style="font-size:13px">${esc(l.grade)} · ${esc(l.depot)}</div></div>
      <div class="cring" data-timer="${l.id}">${ring(t.frac)}<b>${l.phase === 'open' ? mmss(t.left) : '✓'}</b></div></div>
    <div class="kv kv2"><div><div class="k">Hajm</div><div class="v num">${fmt(l.supply)} t</div></div><div><div class="k">Minimal narx</div><div class="v num">${mln(l.reserve)}</div></div></div>
    <div class="foot">${l.phase === 'open'
      ? `<span class="pill g"><span class="live"></span>Ochiq · ${l.sealed} ta taklif</span>${l.mine ? '<span class="pill b">✓ Sizniki bor</span>' : ''}`
      : `<span class="pill">Natija: ${l.last?.price ? mln(l.last.price) : 'savdo yo\'q'}</span><span class="pill">Keyingi: <span data-next="${l.id}">—</span></span>`}</div>
    <div class="envs" data-envs="${l.id}">${'<i></i>'.repeat(Math.min(l.sealed, 16))}</div>
  </a>`;
}
function landing(scrollHow) {
  const key = 'landing';
  if (view.key !== key) {
    view.key = key;
    app.innerHTML = `
    <section class="hero">
      <span class="pill g in"><span class="live"></span>UZEX 2035 · AI agentlar davri</span>
      <h1 class="in" style="--d:1;margin-top:22px"><span class="strike">Tezlik</span> emas.<br><span class="gr">Adolat.</span></h1>
      <p class="in" style="--d:2">Yashirin taklif bering. Hamma g'oliblar bir xil narx to'laydi. Millisekundlar hech narsani hal qilmaydi.</p>
      <div class="ctas in" style="--d:3"><a class="btn" href="#/lots">Auksionga kirish →</a><button class="btn ghost" data-call>📞 Menga qo'ng'iroq qiling</button></div>
    </section>
    <div class="steps3" id="how">
      ${[['🔒', 'Muhrlang', 'Necha tonna va eng ko\'pi bilan qancha. Boshqalar ko\'rmaydi.'], ['⏳', 'Teng kuting', 'Oyna yopilguncha hamma taklif teng. Birinchi bo\'lish ustunlik bermaydi.'], ['⚖️', 'Bir xil narx', 'Yuqori narx ustun. G\'oliblar bir xil narx to\'laydi, ortig\'i qaytadi.']]
        .map(([i, b, p], k) => `<div class="card st in" style="--d:${4 + k}"><span class="n">${k + 1}</span><div class="ic" style="--d:${k}">${i}</div><b>${b}</b><p>${p}</p></div>`).join('')}
    </div>
    <div class="sec-h in" style="--d:7"><h2>Hozir savdoda</h2><a class="navlink" href="#/lots">Hammasi →</a></div>
    <div class="lots" id="lotgrid"></div>
    <div class="ticker"><div id="tick"></div></div>`;
    app.querySelector('[data-call]').onclick = callModal;
    if (scrollHow) setTimeout(() => $('#how').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }
  paintGrid(S.lots.slice(0, 3));
  const items = S.lots.flatMap((l) => l.history.slice(-3).map((h) => `<span>${l.icon} ${esc(l.product)} · raund ${h.round} · <b>${h.price ? mln(h.price) + ' so\'m/t' : 'savdo yo\'q'}</b> · ${h.traded} t</span>`));
  const tk = $('#tick'); const html = (items.length ? items : ['<span>Birinchi raundlar ketmoqda…</span>']).join('');
  if (tk.dataset.h !== html) { tk.dataset.h = html; tk.innerHTML = html + html; }
}
function lotsPage() {
  if (view.key !== 'lots') {
    view.key = 'lots';
    app.innerHTML = `<div class="sec-h"><div><h2 class="in">Auksionlar</h2><div class="muted in" style="--d:1;margin-top:6px">Har bir lot — bitta sotuvchi, bitta tovar, qisqa yashirin raund.</div></div><button class="btn ghost sm in" data-call>📞 Qo'ng'iroq orqali</button></div><div class="lots" id="lotgrid"></div>`;
    app.querySelector('[data-call]').onclick = callModal;
  }
  paintGrid(S.lots);
}
// Repaint lot cards only when something visible changed (timers tick separately), so animations don't replay.
function paintGrid(list) {
  const g = $('#lotgrid'); if (!g) return;
  const sig = list.map((l) => `${l.id}:${l.phase}:${l.round}:${l.sealed}:${!!l.mine}`).join('|');
  if (g.dataset.sig === sig) return;
  const first = !g.dataset.sig;
  g.dataset.sig = sig;
  g.innerHTML = list.map((l, k) => lotCard(l, k, first)).join('');
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

function openView(l) {
  form.qty = l.mine?.qty ?? Math.max(1, Math.round(l.supply / 5));
  form.price = l.mine?.maxPrice ?? l.reserve;
  const pMax = l.reserve + l.tick * Math.max(20, Math.round(l.reserve * 0.12 / l.tick));
  app.innerHTML = `
  <a class="back" href="#/lots">← Auksionlar</a>
  <div class="lothead in"><div class="em">${l.icon}</div><div style="flex:1"><h1>${esc(l.product)}</h1><div class="muted">${esc(l.grade)} · ${esc(l.depot)} · ${fmt(l.supply)} tonna · raund ${l.round}</div></div><span class="pill g"><span class="live"></span>Ochiq</span></div>
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
  <a class="back" href="#/lots">← Auksionlar</a>
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
      <button class="btn ghost" data-call>📞 Natijani qo'ng'iroqda eshitish</button>
    </div>
  </div>`;
  if (P) countUp($('#pbig'), P, 1100, fmt);
  if (justClosed && me?.x) setTimeout(confetti, 500);
  app.querySelector('[data-call]').onclick = callModal;
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

poll();
