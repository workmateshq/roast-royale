// Roast Royale's online room (runs in the host's browser; js/net/net.js does the networking).
// Two wrestlers. The room keeps who's here and which chicken each has picked; the fight itself runs
// in the host's game (js/main.js), so during a bout the room just relays:
//   guest controls -> host ('pad'), host's fight state -> guest ('snap'), host's match flow -> guest ('flow').
(function (root) {
  const MAX_PLAYERS = 2;
  const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

  function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    return code;
  }

  class GameRoom {
    constructor(code, hooks) {
      this.code = code;
      this.broadcast = hooks.broadcast;
      this.send = hooks.send;
      this.players = new Map();   // id -> { id, slot (1 blue, 2 red), pick, locked }
      this.order = [];
      this.hostId = null;
      this.started = false;
    }

    join(id) {
      if (this.players.has(id)) return { ok: false, error: 'Already in this room.' };
      if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'This ring already has two wrestlers.' };
      const taken = new Set([...this.players.values()].map((p) => p.slot));
      const slot = taken.has(1) ? 2 : 1;
      this.players.set(id, { id, slot, pick: slot === 1 ? 0 : 1, locked: false });
      this.order.push(id);
      if (!this.hostId) this.hostId = id;
      return { ok: true, payload: { playerId: id, ...this.lobbyPayload() } };
    }

    announceJoin() { this.broadcastLobby(); }

    leave(id) {
      if (!this.players.delete(id)) return;
      this.order = this.order.filter((p) => p !== id);
      if (!this.players.size) return;
      if (this.hostId === id) this.hostId = this.order[0];
      // Someone left mid-tournament: back to choosing chickens.
      this.started = false;
      this.players.forEach((p) => { p.locked = false; });
      this.broadcastLobby();
    }

    // The host starts the tournament once both wrestlers have locked in their chickens.
    start(id) {
      if (id !== this.hostId || this.players.size < 2 || [...this.players.values()].some((p) => !p.locked)) return false;
      this.started = true;
      this.broadcast('gameStarted', this.lobbyPayload());
      return true;
    }

    input(id, msg) {
      const p = this.players.get(id);
      if (!p || !msg || typeof msg !== 'object') return false;
      switch (msg.type) {
        case 'pick':
          if (this.started || !Number.isInteger(msg.pick) || msg.pick < 0 || msg.pick > 31) return false;
          p.pick = msg.pick;
          p.locked = !!msg.locked;
          this.broadcastLobby();
          return true;
        case 'pad':   // the guest's controls, to the host
          if (id === this.hostId) return false;
          this.send(this.hostId, 'pad', msg);
          return true;
        case 'snap':  // the host's fight state, to the guest
        case 'flow':  // the host's match flow (new round, decision, champion, back to selection)
          if (id !== this.hostId) return false;
          if (msg.type === 'flow' && msg.kind === 'select') {
            this.started = false;
            this.players.forEach((q) => { q.locked = false; });
            this.broadcastLobby();
          }
          this.players.forEach((q) => { if (q.id !== id) this.send(q.id, msg.type, msg); });
          return true;
        default:
          return false;
      }
    }

    lobbyPayload() {
      return {
        roomCode: this.code, hostId: this.hostId, started: this.started,
        players: this.order.map((id) => ({ ...this.players.get(id) })),
      };
    }

    broadcastLobby() { this.broadcast('lobbyUpdate', this.lobbyPayload()); }

    destroy() {}
  }

  root.RoastEngine = { GameRoom, generateRoomCode, MAX_PLAYERS };
})(typeof self !== 'undefined' ? self : this);
