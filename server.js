import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createMarket, fmt } from './src/market.js';
const VERSION = Date.now().toString(36);

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = join(import.meta.dirname, 'public');
const market = createMarket({ openMs: Number(process.env.OPEN_MS || 60_000), revealMs: Number(process.env.REVEAL_MS || 25_000) });
setInterval(() => { try { market.tick(); } catch (e) { console.error('tick', e); } }, 250);

// ---------- Voice (ElevenLabs Agents + Twilio outbound) ----------
const EL = { key: process.env.ELEVENLABS_API_KEY, agent: process.env.ELEVENLABS_AGENT_ID, phoneId: process.env.ELEVENLABS_PHONE_NUMBER_ID, secret: process.env.VOICE_TOOL_SECRET, via: process.env.ELEVENLABS_TELEPHONY || 'sip' };
const voiceReady = () => !!(EL.key && EL.agent && EL.phoneId);
const lastCall = new Map();
let callsThisHour = { hour: 0, n: 0 };
const MAX_CALLS_PER_HOUR = Number(process.env.MAX_CALLS_PER_HOUR || 30);

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (/^998\d{9}$/.test(d)) return '+' + d;
  if (/^\d{9}$/.test(d)) return '+998' + d;
  if (/^\d{10,15}$/.test(d) && String(p).trim().startsWith('+')) return '+' + d;
  return null;
}
function lotsSummary() {
  return market.state().lots.filter((l) => l.phase === 'open').map((l) => `${l.product} (${l.grade}), ${l.depot}: ${l.supply} tonna, minimal narx ${fmt(l.reserve)} so'm/tonna, narx qadami ${fmt(l.tick)}, kod "${l.id}"`).join('; ');
}
async function placeCall({ phone, buyer, purpose, text }) {
  const hour = Math.floor(Date.now() / 3_600_000);
  if (callsThisHour.hour !== hour) callsThisHour = { hour, n: 0 };
  if (callsThisHour.n >= MAX_CALLS_PER_HOUR) return { ok: false, reason: 'Soatlik qo\'ng\'iroq limiti tugadi' };
  if (purpose === 'order' && Date.now() - (lastCall.get(phone) || 0) < 90_000) return { ok: false, reason: 'Biroz kuting — qo\'ng\'iroq yo\'lda' };
  callsThisHour.n++; lastCall.set(phone, Date.now());
  const path = EL.via === 'twilio' ? 'twilio/outbound-call' : 'sip-trunk/outbound-call';
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/${path}`, {
    method: 'POST', headers: { 'xi-api-key': EL.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: EL.agent, agent_phone_number_id: EL.phoneId, to_number: phone,
      conversation_initiation_client_data: { dynamic_variables: { buyer_id: buyer, purpose, lots: lotsSummary() || 'Hozir ochiq lot yo\'q', result_text: text || '' } },
      telephony_call_config: { ringing_timeout_secs: 40 },
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.success === false) { console.error('voice call failed', r.status, JSON.stringify(body).slice(0, 500)); return { ok: false, reason: 'Qo\'ng\'iroq boshlanmadi', detail: body.detail || body.message }; }
  console.log('voice call ok', purpose, phone.slice(0, 6) + '…', body.conversation_id);
  return { ok: true, conversationId: body.conversation_id };
}
// Call buyers back with their result if they ordered by phone (or asked for it).
market.onClose((L, settle) => {
  if (!voiceReady() || process.env.RESULT_CALLS !== '1') return;
  for (const s of settle) {
    const phone = market.phones.get(s.buyer);
    if (!phone || s.buyer.startsWith('bot:')) continue;
    const text = s.x > 0
      ? `${L.product} auksioni yakunlandi. Siz ${s.x} tonna oldingiz, narx ${fmt(L.last.result.price)} so'm. ${fmt(s.released)} so'm hisobingizga qaytdi.`
      : `${L.product} auksioni yakunlandi. Bu safar taklifingiz yutmadi, butun summa qaytarildi.`;
    console.log('result call scheduled', L.id, L.round, s.x + 't');
    // Wait so the buyer has hung up the ordering call before we ring back.
    setTimeout(() => placeCall({ phone, buyer: s.buyer, purpose: 'result', text }).catch((e) => console.error('result call error', e.message)), Number(process.env.RESULT_CALL_DELAY_MS || 45_000));
  }
});

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const int = (v) => (typeof v === 'string' ? Number(v.replace(/[\s,]/g, '')) : Number(v));

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/state' && req.method === 'GET') return send(res, 200, { ...market.state(url.searchParams.get('buyer')), voice: voiceReady() });
    if (p === '/api/orders' && req.method === 'POST') {
      const b = await body(req);
      return send(res, 200, market.submit({ lotId: b.lotId, buyer: String(b.buyer || ''), name: b.name, qty: int(b.qty), maxPrice: int(b.maxPrice), idemKey: b.idemKey }));
    }
    if (p === '/api/orders' && req.method === 'DELETE') { const b = await body(req); return send(res, 200, market.cancel({ lotId: b.lotId, buyer: String(b.buyer || '') })); }
    if (p === '/api/verify' && req.method === 'POST') { const b = await body(req); return send(res, 200, market.verify(b.lotId)); }
    if (p === '/api/agent/suggest' && req.method === 'POST') { const b = await body(req); return send(res, 200, market.suggest({ lotId: b.lotId, need: int(b.need), urgency: b.urgency, budget: b.budget ? int(b.budget) : undefined })); }

    // Web "call me" button
    if (p === '/api/voice/call' && req.method === 'POST') {
      const b = await body(req);
      const phone = normPhone(b.phone);
      if (!phone) return send(res, 200, { ok: false, reason: 'Raqam +998 XX XXX XX XX ko\'rinishida bo\'lsin' });
      if (!voiceReady()) return send(res, 200, { ok: false, reason: 'Ovozli agent hali ulanmagan', notConfigured: true });
      const buyer = String(b.buyer || '');
      market.wallet(buyer, b.name); market.phones.set(buyer, phone);
      return send(res, 200, await placeCall({ phone, buyer, purpose: 'order' }));
    }
    // ElevenLabs conversation-initiation webhook: for INCOMING calls, tell the agent who is calling.
    if (p === '/api/voice/init' && req.method === 'POST') {
      const b = await body(req);
      const phone = normPhone(b.caller_id || b.from || '');
      const buyer = phone ? 'tel:' + phone : 'tel:unknown';
      if (phone) { market.wallet(buyer, 'Telefon ' + phone.slice(-4)); market.phones.set(buyer, phone); }
      console.log('inbound call', phone ? phone.slice(0, 6) + '…' : 'unknown');
      return send(res, 200, { type: 'conversation_initiation_client_data', dynamic_variables: { buyer_id: buyer, purpose: 'order', lots: lotsSummary() || 'Hozir ochiq lot yo\'q', result_text: '' } });
    }
    // ElevenLabs agent server tools (webhooks). Protected by a shared secret header.
    if (p.startsWith('/api/voice/tool/')) {
      if (!EL.secret || req.headers['x-tool-secret'] !== EL.secret) return send(res, 401, { ok: false });
      const b = await body(req);
      if (p === '/api/voice/tool/lots') return send(res, 200, { lots: lotsSummary() || 'Hozir ochiq auksion yo\'q' });
      if (p === '/api/voice/tool/order') {
        const phone = normPhone(b.phone || b.caller_id);
        const buyer = String(b.buyer_id && !String(b.buyer_id).includes('{{') ? b.buyer_id : phone ? 'tel:' + phone : '');
        if (!buyer) return send(res, 200, { ok: false, say: 'Xaridorni aniqlab bo\'lmadi' });
        if (phone && !market.phones.has(buyer)) market.phones.set(buyer, phone);
        market.wallet(buyer, b.name || (phone ? 'Telefon ' + phone.slice(-4) : undefined));
        const r = market.submit({ lotId: b.lot_id, buyer, qty: int(b.qty), maxPrice: int(b.max_price), idemKey: b.idem_key, via: 'phone' });
        console.log('phone order', b.lot_id, b.qty, b.max_price, r.ok ? 'ok' : r.reason);
        return send(res, 200, r.ok ? { ok: true, say: `Taklif qabul qilindi: ${b.qty} tonna, eng ko'pi bilan ${fmt(int(b.max_price))} so'm. Raund yopilgach natijani aytamiz.` } : { ok: false, say: r.reason });
      }
      return send(res, 404, { ok: false });
    }

    // Static
    const file = normalize(join(PUBLIC, p === '/' ? 'index.html' : p));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { ok: false });
    let data = await readFile(file).catch(() => null);
    const isHtml = !data || extname(file) === '.html';
    if (isHtml) data = (await readFile(join(PUBLIC, 'index.html'), 'utf8')).replace('/app.js', `/app.js?v=${VERSION}`);
    res.writeHead(200, { 'Content-Type': isHtml ? TYPES['.html'] : TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store, max-age=0' });
    res.end(data);
  } catch (e) {
    console.error(e);
    send(res, 500, { ok: false, reason: 'Server xatosi' });
  }
}).listen(PORT, () => console.log(`Aniq fair auction on :${PORT} · voice ${voiceReady() ? 'on' : 'off'}`));
