# Roast Royale

A sumo wrestling prototype starring plump, headless roast chickens, played with complete solemnity.

Run it from a local web server (ES modules and the model won't load from `file://`):

```
cd roast-royale
python3 -m http.server 3970
```

Then open http://localhost:3970.

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

- **Versus CPU**: pick your chicken, the house picks a rival, best of three.
- **Versus a mate**: 2 to 4 players in one ring, free-for-all. Create a ring to get a 4-letter code (or invite link) and send it to your mates, or join theirs. Link rooms work too: share https://zakrowling.github.io/roast-royale/mate and nobody needs a code. The first person to open it hosts and everyone else joins; if the host leaves, the next player takes over, so the ring stays open while anyone's in it (the online screen has a button for it as well). Any 2–16 letters, numbers or dashes work as a room name (`/roast-royale/<name>` or `?room=<name>`), and an embedding app can pass `?group=<session id>` to give each group its own private ring. Everyone wrestles at once as P1 to P4, in blue, red, green and gold mawashi (three or four start in a cross: P1 facing P2, P3 facing P4): a chicken that's pushed out or topples is out of that round, and the last chicken standing wins it. First to two round wins is the champion. The tournament starts once at least two are in the ring and everyone has readied up. The ring's creator hosts and runs the fight; the others send their controls and see the host's fight.

| Chicken | Cook | Style |
| --- | --- | --- |
| Rōsuto | Golden roast | The all-rounder |
| Yakitori | Barely crispy | Soft and forgiving |
| Reitō | Frozen raw chook | Heavy and stiff, slow to turn |
| Katsudon | Battered | Heavy shove, crunchy armour |
| Kogeta | Extra crispy (charcoal black) | Light and quick, but brittle |
| Funiku | Rotten (grey, mouldy, fuzzy) | Hits hard, falls apart |

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
- `js/roster.js`: the chickens to choose from and their stats.
- `js/select.js`: the choose-your-chicken screen.
- `js/online.js`, `js/net/`: online play (PeerJS); `404.html` turns `/roast-royale/<name>` links into rooms.
- `js/main.js`: camera, animation, HUD, select and tournament flow, online sync and the main loop.

In the browser console, `roast.debugRig(true)` tints each part of the chicken by the bone that moves it.

To check a pose close up, open `?pose=push` (or `brace`, `windup`, `charge`, `dodge`, `idle`), optionally with `&az=1.5` to orbit the camera, then press Enter. For `out`, `&ft=0.5` holds the fall at that many seconds in.

## Credits

"Roast chicken" (https://skfb.ly/6XHDu) by daidaiaoko is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). The game stands it upright, rigs it and paints a mawashi onto it. The wings were cut free of the body in Blender (and the body and wing roots closed over) so they can swing away from the chest.

Music: `assets/music/hitslab-japan-japanese-music.mp3` (menus) and `assets/music/sonican-taiko-energy.mp3` (fights). Crowd sounds are in `assets/cheers/`.

Three.js is loaded from the jsDelivr CDN, PeerJS from unpkg.
