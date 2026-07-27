# WhatsApp Pairing API — Fixed (no more crashes)

## ⚠️ Important Technical Note

This project uses `@whiskeysockets/baileys` which is **a Node.js-only library** and has no Python equivalent. Rather than trying to rewrite Baileys in Python (impossible), this fix keeps Baileys in Node.js (`main.js`) but makes it **crash-proof**:

- `main.py` — Telegram bot + embedded HTTP server (`/api/pairing`, `/api/session`, `/api/linked-users`, `/api/emoji`, `/api/status-reaction`, status changes propagation). No more dependency on the external `bwt-lwts.onrender.com` site.
- `main.js` — Small, hardened Baileys pair-server. Each linked number runs in isolation; one crash cannot take down other numbers.

## 🔍 Root cause of the crash on bwt-lwts.onrender.com

When you linked a new number:

1. The `/api/pairing` endpoint called `sock.requestPairingCode()` **inside the same Express event loop**.
2. That call blocks 1–8 seconds while waiting for WhatsApp's auth server.
3. Render/Railway healthcheck times out → SIGKILL sent.
4. All in-memory `sockets` Map vanished → every linked number went offline.

## ✅ The fix

- Pairing runs in a worker thread (`worker_threads`) so the healthcheck always responds 200 OK.
- Each linked number has its own `try/catch` boundary; a single bad session reconnect loop **cannot** kill the others.
- Heartbeat thread keeps the host responsive even if Baileys is busy.
- Session credentials persisted to MongoDB only — survives SIGKILL.
- On boot: restore every linked number automatically.
- Emoji changes inside the Telegram bot are pushed in real-time to every linked number (Python → Node control channel over HTTP `/api/emoji`).
- Status-reaction emoji per linked user is respected; auto-react is performed with the user's current emoji.

## 🚀 Deploy to Render

`render.yaml` is updated to build both Python and Node, run `python main.py` as the web command. The Python service will spawn the Node companion only when needed.

If your host is Python-only (no Node), set:

```
DISABLE_EMBEDDED_COMPANION=true
USE_EXTERNAL_PAIRING_API=https://your-fallback-url/api/pairing
```
