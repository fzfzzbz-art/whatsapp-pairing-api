const { EventEmitter } = require('events');

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

async function waitForPhone(phone, { timeoutMs = 6000 } = {}) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  const existing = socketMap.get(normalizedPhone);
  if (existing) return existing;

  return new Promise((resolve) => {
    const onActivated = (activatedPhone, socket) => {
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

module.exports = {
  pairingBridge: {
    setSocket,
    releaseSocket,
    getSocket,
    getPhoneMeta,
    listActivePhones,
    getBridgeState,
    setConnectionState,
    getConnectionState,
    waitForPhone,
    emitter,
  },
};
