const { EventEmitter } = require('events');

/**
 * lib/pairingBridge — pub/sub registry for live WhatsApp sockets.
 *
 * BEFORE: a single in-memory `socket` variable. The Telegram bot never knew
 * when a freshly-paired number came online, so activation was a coin flip.
 *
 * AFTER: index.js (the Telegram bot) and server.js (the Baileys companion)
 * share the SAME Node process and the SAME module cache. The companion pushes
 * the live socket here on `connection === 'open'`; the bot process registers
 * a listener and reacts within the same tick — typically <50 ms.
 */

const emitter = new EventEmitter();
emitter.setMaxListeners(0);
const socketMap = new Map();
const metaMap = new Map();
let connectionState = 'idle';
let lastUpdatedAt = new Date().toISOString();

function touch() { lastUpdatedAt = new Date().toISOString(); }

function setConnectionState(state) {
  connectionState = state || 'unknown';
  touch();
  return connectionState;
}

function getConnectionState() { return connectionState; }

function setSocket(phone, socket, metadata = {}) {
  if (!phone) return null;
  const normalizedPhone = String(phone).replace(/\D/g, '');
  if (!normalizedPhone) return null;

  socketMap.set(normalizedPhone, socket);
  metaMap.set(normalizedPhone, { ...(metaMap.get(normalizedPhone) || {}), ...metadata, phone: normalizedPhone, registered: metadata?.registered !== false });
  touch();
  setConnectionState('open');

  // [FIX] Fire the activation event synchronously. `index.js` `waClients`
  // will register here, and any "await pairingBridge.waitForPhone(phone)" in
  // the same process will resolve in this same tick.
  setImmediate(() => {
    try { emitter.emit('phone.activated', normalizedPhone, socket, metaMap.get(normalizedPhone) || {}); } catch (_) {}
  });

  return socket;
}

function releaseSocket(phone) {
  if (!phone) return false;
  const normalizedPhone = String(phone).replace(/\D/g, '');
  if (!normalizedPhone) return false;
  const existed = socketMap.delete(normalizedPhone);
  metaMap.delete(normalizedPhone);
  if (socketMap.size === 0) setConnectionState('idle');
  touch();
  if (existed) {
    setImmediate(() => {
      try { emitter.emit('phone.released', normalizedPhone); } catch (_) {}
    });
  }
  return existed;
}

function getSocket(phone = '') {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  return socketMap.get(normalizedPhone) || null;
}

function getPhoneMeta(phone = '') {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  return metaMap.get(normalizedPhone) || null;
}

function listActivePhones() {
  return Array.from(socketMap.keys());
}

function getBridgeState() {
  return {
    connectionState,
    hasSocket: socketMap.size > 0,
    activePhones: listActivePhones(),
    lastUpdatedAt,
    socketCount: socketMap.size,
  };
}

function onPhoneActivated(handler) {
  emitter.on('phone.activated', handler);
  return () => emitter.off('phone.activated', handler);
}

function onPhoneReleased(handler) {
  emitter.on('phone.released', handler);
  return () => emitter.off('phone.released', handler);
}

async function waitForPhone(phone, { timeoutMs = 6000 } = {}) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  const existing = socketMap.get(normalizedPhone);
  if (existing) return existing;

  return new Promise((resolve) => {
    const onActivated = (activatedPhone, socket, meta) => {
      if (String(activatedPhone).replace(/\D/g, '') === normalizedPhone) {
        cleanup();
        resolve(socket);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(socketMap.get(normalizedPhone) || null);
    }, Math.max(250, Number(timeoutMs) || 6000));
    const cleanup = () => {
      emitter.off('phone.activated', onActivated);
      clearTimeout(timer);
    };
    emitter.on('phone.activated', onActivated);
  });
}

const pairingBridge = {
  setSocket,
  releaseSocket,
  getSocket,
  getPhoneMeta,
  listActivePhones,
  getBridgeState,
  setConnectionState,
  getConnectionState,
  onPhoneActivated,
  onPhoneReleased,
  waitForPhone,
  emitter,
};

module.exports = { pairingBridge };
