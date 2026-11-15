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
- `js/effects.js`: particles, synthesised sounds and camera shake.
- `js/main.js`: camera, animation, HUD, tournament flow and the main loop.

In the browser console, `roast.debugRig(true)` tints each part of the chicken by the bone that moves it.

To check a pose close up, open `?pose=push` (or `brace`, `windup`, `charge`, `dodge`, `idle`), optionally with `&az=1.5` to orbit the camera, then press Enter.

## Credits

"Roast chicken" (https://skfb.ly/6XHDu) by daidaiaoko is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). The game stands it upright, rigs it and paints a mawashi onto it.

Three.js is loaded from the jsDelivr CDN.
