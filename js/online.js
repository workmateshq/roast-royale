// Roast Royale online: a thin wrapper round js/net/net.js (PeerJS, no game server). The host's
// browser runs the fight; the guest sends its controls and draws the host's state.
// Rooms work like the other mates games: a 4-letter code, a link room (/roast-royale/mate), or
// ?group=<session id> from an app embedding the game.
export function createOnline(handlers) {
  const Net = window.RoastNet;
  if (!Net) return null;   // PeerJS didn't load (offline)
  const socket = Net.createNet();
  for (const ev of ['lobbyUpdate', 'gameStarted', 'pad', 'snap', 'flow', 'disconnect', 'reconnecting', 'rejoined', 'status']) {
    if (handlers[ev]) socket.on(ev, handlers[ev]);
  }
  return {
    create: (ack) => socket.emit('createRoom', ack),
    join: (code, ack) => socket.emit('joinRoom', code, ack),
    enter: (name, ack) => socket.emit('enterRoom', name, ack),
    leave: () => socket.emit('leaveRoom'),
    start: () => socket.emit('startGame'),
    send: (msg) => socket.emit('input', msg),
    get isHost() { return socket.isHost; },
    get id() { return socket.id; },
    normalise: Net.normaliseRoomName,
  };
}

// An embedding app's session id, hashed into a 4-letter code like any other room.
export function groupRoom(id) {
  if (!id) return null;
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  let hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  let code = '';
  for (let i = 0; i < 4; i++) { code += LETTERS[hash % LETTERS.length]; hash = Math.floor(hash / LETTERS.length); }
  return code;
}
