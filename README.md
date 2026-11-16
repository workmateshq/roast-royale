# Roast Royale

A sumo wrestling prototype starring plump, headless roast chickens, played with complete solemnity.

Run it from a local web server (ES modules and the model won't load from `file://`):

```
cd roast-royale
python3 -m http.server 3970
```

Then open http://localhost:3970.

In a match, the buttons under the round name are Home (in the solo tournament or practice, back to the home screen; online, everyone back to the lobby, still in the ring), Music on/off and Sound effects on/off (incl. the announcer and the crowd). Your music and sound choices are remembered on your device. Online play uses a Metered TURN relay (set in `js/net/config.js`) for players who can't connect directly.

## Controls

| Input | Move |
| --- | --- |
| WASD / arrows / left stick | Waddle (camera-relative, with momentum and turning lag) |
| Space (hold, release) | Drumstick Charge: wind up, then launch in a straight line |
| Left click (quick) | Breast Push: both wings thrust forward in a shove |
| Right click (hold) | Chicken Brace: hips drop, legs splay, wings out; heavily resists knockback |
| Shift | Wing Dodge: a quick sidestep |
| Click and drag | Turn the camera round the ring (and up or down) |

Gamepad: A charge, X / RB push, LB / triggers brace, B dodge.

## Modes and roster

The home screen is the lobby: a card with four player slots, P1 to P4 (blue, red, green and gold), showing who's in the ring.

- **Solo Tournament** (the button on the home screen, or Enter): pick your chicken (only yours is shown), then climb the banzuke through 8 stages, each best of three rounds against the CPU, which gets sharper every stage: stage 1 is a **mirror match** against your own chicken, stages 2 to 7 are the six other chickens in a random order, and stage 8 is the final boss, **Megarōsuto**, a golden roast twice the size of Rōsuto (twice the reach, far heavier, slower to turn, hits like a truck). Before each stage the **Battle Plan** shows the ladder (Megarōsuto at the top, the mirror match at the bottom) with your portrait beside the rung you're on, stepping up a rung after each stage you win; it starts the stage by itself after a few seconds, or on any key or tap. Lose a stage and **Continue?** counts down from 10: any key or tap fights that stage again from round 1, otherwise it's back to the home screen. Beat Megarōsuto for the Emperor's Cup (yūshō).
- **Practice** (next to Solo Tournament): pick your chicken and train against a passive training dummy on a sunny clifftop meadow above the sea. No rounds, no clock: push it out or topple it and you're both reset a moment later, with a running tally. Home goes back to the home screen.
- **Online, 2 to 4 players**: **Create a ring** to get a 4-letter code (or invite link) and send it to your mates, or type theirs and **Join**. Once you're in a ring, the lobby shows P1 to P4, the code and a Copy link button, and the host (whoever created it) presses **Start game with N players** once at least one mate has joined; everyone then chooses their chicken, and the tournament starts when they've all readied up. **Create or join a new room** leaves the ring; the select screen's Back to lobby (and Home during a fight) takes everyone in the ring back to the lobby. Link rooms work too: share https://zakrowling.github.io/roast-royale/mate and nobody needs a code; opening it lands you straight in that ring's lobby. The first person to open it hosts and everyone else joins; if the host leaves, the next player takes over, so the ring stays open while anyone's in it. Any 2–16 letters, numbers or dashes work as a room name (`/roast-royale/<name>` or `?room=<name>`), and an embedding app can pass `?group=<session id>` to give each group its own private ring. Mates can join while the others are choosing chickens, but not mid-tournament. Everyone wrestles at once as P1 to P4, in their slot's mawashi (three or four start in a cross: P1 facing P2, P3 facing P4): a chicken that's pushed out or topples is out of that round, and the last chicken standing wins it. First to two round wins is the champion. The host runs the fight; the others send their controls and see the host's fight.

| Chicken | Cook | Style |
| --- | --- | --- |
| Rōsuto | Golden roast | The all-rounder |
| Yakitori | Barely crispy | Soft and forgiving |
| Reitō | Frozen raw chook | Heavy and stiff, slow to turn |
| Katsu | Battered | Heavy shove, crunchy armour |
| Kogeta | Extra crispy (charcoal black) | Light and quick, but brittle |
| Funiku | Rotten (grey, mouldy, fuzzy) | Hits hard, falls apart |
| Rappu | Raw and white, in a tied roasting bag | Slippery and cushioned |

Megarōsuto (the solo tournament's final boss) isn't selectable.

Win a round by pushing your rival out of the ring (Yorikiri), or draining their balance to 100% so they topple (Koppori). Stepping out on your own is Isamiashi. Best of three rounds.

## Files

- `index.html`: page structure, HUD and screens.
- `css/game.css`: all styling.
- `js/config.js`: tunables (ring size, movement feel) and small helpers.
- `js/scene.js`: renderer, camera, lighting, procedural textures and the dohyō.
- `js/chicken.js`: the chicken model, its rig (legs, wings with backwards-bending elbows), walking and arm poses, and the painted-on mawashi.
- `js/physics.js`: wrestlers, momentum, the four moves, balance, collisions and the ring edge.
- `js/ai.js`: the CPU opponent's state machine.
- `js/input.js`: keyboard, mouse and gamepad.
- `js/effects.js`: particles, synthesised sounds (with hall reverb) and camera shake.
- `js/voice.js`: the announcer: spoken calls (hakkeyoi, nokotta, the winning technique, yūshō) and the chickens' names, compressed with a little hall reverb, from `assets/words/`.
- `js/music.js`: looping background music (menus, and taiko only while a round is fought), plus crowd cheers at big moments and applause for the champion.
- `js/roster.js`: the chickens to choose from and their stats, plus the solo tournament's boss (Megarōsuto).
- `js/lobby.js`: the home screen's lobby slots (P1 to P4).
- `js/select.js`: the choose-your-chicken screen.
- `js/online.js`, `js/net/`: online play (PeerJS); `404.html` turns `/roast-royale/<name>` links into rooms.
- `js/main.js`: camera, animation, HUD, select and tournament flow (incl. the solo tournament's battle plan and continue), online sync and the main loop.

In the browser console, `roast.debugRig(true)` tints each part of the chicken by the bone that moves it, and `roast.soloJump(8)` jumps the solo tournament to that stage's battle plan (8 is Megarōsuto).

To check a pose close up, open `?pose=push` (or `brace`, `windup`, `charge`, `dodge`, `idle`), optionally with `&az=1.5` to orbit the camera, then press Enter. For `out`, `&ft=0.5` holds the fall at that many seconds in.

## Credits

"Roast chicken" (https://skfb.ly/6XHDu) by daidaiaoko is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). The game stands it upright, rigs it and paints a mawashi onto it. The wings were cut free of the body in Blender (and the body and wing roots closed over) so they can swing away from the chest.

Music: `assets/music/hitslab-japan-japanese-music.mp3` (menus) and `assets/music/sonican-taiko-energy.mp3` (fights). Crowd sounds are in `assets/cheers/`.

Three.js is loaded from the jsDelivr CDN, PeerJS from unpkg.
