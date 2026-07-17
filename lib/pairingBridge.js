let socket = null;
let connectionState = 'idle';
let lastUpdatedAt = new Date().toISOString();

function touch() {
  lastUpdatedAt = new Date().toISOString();
}

function setSocket(newSocket) {
  socket = newSocket || null;
  touch();
  return socket;
}

function getSocket() {
  return socket;
}

function setConnectionState(state) {
  connectionState = state || 'unknown';
  touch();
  return connectionState;
}

function getConnectionState() {
  return connectionState;
}

function getBridgeState() {
  return {
    connectionState,
    hasSocket: !!socket,
    user: socket?.user || null,
    lastUpdatedAt,
  };
}

module.exports = {
  setSocket,
  getSocket,
  setConnectionState,
  getConnectionState,
  getBridgeState,
};
