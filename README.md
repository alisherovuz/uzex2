# Aniq — fair sealed batch auction (UZEX AI Hackathon)

Buyers (people, AI agents, or phone callers) privately submit **quantity + maximum price** during a short window. When it closes, all accepted orders are cleared together: higher prices have priority, arrival time never does, everyone who wins pays **one common price**, ties at the cutoff share pro-rata (largest remainder + recorded lottery), and unused money is released.

- `src/engine.js` — clearing engine, spec v0.1 (integer arithmetic, invariants).
- `src/market.js` — lots, rounds, wallets/reservations, receipts, replace/cancel, idempotency, simulated buyer agents, settlement, audit record, agent advice.
- `server.js` — HTTP API + static UI + voice (ElevenLabs Agents outbound calls via Twilio).
- `public/` — the web app (Uzbek).

Run: `npm start` · Test: `npm test`

## Voice (optional)
Set env vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_PHONE_NUMBER_ID` (the imported number), `VOICE_TOOL_SECRET`, `ELEVENLABS_TELEPHONY` (`sip` default, or `twilio`).
Optional: `RESULT_CALLS=1` (call phone buyers back with results), `MAX_CALLS_PER_HOUR` (default 30).

Agent server tools (header `x-tool-secret: $VOICE_TOOL_SECRET`):
- `POST /api/voice/tool/lots` → open lots summary
- `POST /api/voice/tool/order` `{buyer_id, lot_id, qty, max_price, idem_key}` → places the order

Dynamic variables passed to the agent on each call: `buyer_id`, `purpose` (`order` | `result`), `lots`, `result_text`.

## Data
Market prices, price history, sellers and totals come from the organizers' UZEX dataset (500 000 deals, 2022–2026): `src/data/market.json`, built by `python3 scripts/build_real.py <dataset_dir> src/data/market.json`. Live rounds and the other bidders are simulated. No real money.
