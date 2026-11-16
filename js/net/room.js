// Roast Royale's online room (runs in the host's browser; js/net/net.js does the networking).
// Two to four wrestlers, all in one ring. The room keeps who's here and which chicken each has picked; the fight itself runs
// in the host's game (js/main.js), so during a bout the room just relays:
//   guest controls -> host ('pad', tagged with who sent them), host's fight state -> guests ('snap'),
//   host's match flow -> guests ('flow').
// The room moves through three phases: 'lobby' (gathering on the home screen; the host presses Start),
// 'select' (choosing chickens; mates can still join) and 'match' (the tournament; nobody new can join).
(function (root) {
  const MAX_PLAYERS = 4;
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
      this.players = new Map();   // id -> { id, slot (1 blue, 2 red, 3 green, 4 gold), pick, locked }
      this.order = [];
      this.hostId = null;
      this.phase = 'lobby';
    }

    get started() { return this.phase === 'match'; }

    // Everyone back to the home lobby, still in the ring.
    toLobby(by) {
      this.phase = 'lobby';
      this.players.forEach((q) => { q.locked = false; });
      this.broadcastLobby();
      this.players.forEach((q) => this.send(q.id, 'flow', { type: 'flow', kind: 'lobby', by }));
    }

    join(id) {
      if (this.players.has(id)) return { ok: false, error: 'Already in this room.' };
      if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'This ring is full (four wrestlers).' };
      if (this.phase === 'match') return { ok: false, error: 'A tournament is under way in this ring. Try again when it ends.' };
      const taken = new Set([...this.players.values()].map((p) => p.slot));
      let slot = 1;
      while (taken.has(slot)) slot++;
      this.players.set(id, { id, slot, pick: (slot - 1) % 6, locked: false });
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
      // Someone left while choosing or mid-tournament: everyone back to the lobby.
      if (this.phase === 'lobby') this.broadcastLobby();
      else this.toLobby(id);
    }

    // The host starts the tournament once everyone (two to four wrestlers) has locked in a chicken.
    start(id) {
      if (this.phase !== 'select' || id !== this.hostId || this.players.size < 2 || [...this.players.values()].some((p) => !p.locked)) return false;
      this.phase = 'match';
      this.broadcast('gameStarted', this.lobbyPayload());
      return true;
    }

    input(id, msg) {
      const p = this.players.get(id);
      if (!p || !msg || typeof msg !== 'object') return false;
      switch (msg.type) {
        case 'begin': // the host, from the lobby: everyone on to choosing chickens
          if (id !== this.hostId || this.phase !== 'lobby' || this.players.size < 2) return false;
          this.phase = 'select';
          this.players.forEach((q) => { q.locked = false; });
          this.broadcastLobby();
          this.players.forEach((q) => this.send(q.id, 'flow', { type: 'flow', kind: 'select', by: id }));
          return true;
        case 'pick':
          if (this.phase === 'match' || !Number.isInteger(msg.pick) || msg.pick < 0 || msg.pick > 31) return false;
          p.pick = msg.pick;
          p.locked = !!msg.locked;
          this.broadcastLobby();
          return true;
        case 'pad':   // a guest's controls, to the host (who needs to know whose they are)
          if (id === this.hostId) return false;
          this.send(this.hostId, 'pad', { ...msg, from: id });
          return true;
        case 'home':  // anyone, from the fight: back to the lobby, still in the ring
        case 'lobby': // anyone, from choosing chickens
          if (this.phase !== 'lobby') this.toLobby(id);
          return true;
        case 'snap':  // the host's fight state, to the guests
        case 'flow':  // the host's match flow (new round, decision, champion, back to selection)
          if (id !== this.hostId) return false;
          if (msg.type === 'flow' && msg.kind === 'select') {
            this.phase = 'select';
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
        roomCode: this.code, hostId: this.hostId, phase: this.phase, started: this.started,
        players: this.order.map((id) => ({ ...this.players.get(id) })),
      };
    }

    broadcastLobby() { this.broadcast('lobbyUpdate', this.lobbyPayload()); }

    destroy() {}
  }

  root.RoastEngine = { GameRoom, generateRoomCode, MAX_PLAYERS };
})(typeof self !== 'undefined' ? self : this);
