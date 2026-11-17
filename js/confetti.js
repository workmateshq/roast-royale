// Roast Royale: a one-off confetti cannon for the champion. Two bursts fired up and inwards from the
// bottom corners, paper pieces fluttering down, on a canvas laid over everything. Cleans itself up.
const COLOURS = ['#e8c27a', '#f3d48e', '#c99a45', '#b8283f', '#ff4f6a', '#2f4fbf', '#8fa6ff', '#ffffff', '#4fdc72'];
let running = false;

export function confetti() {
  if (running) return;
  running = true;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:50';
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const size = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
  size();
  addEventListener('resize', size);

  const W = () => innerWidth, H = () => innerHeight;
  const bits = [];
  const fire = (fromLeft) => {
    const n = Math.round(Math.min(220, W() * 0.18));
    for (let i = 0; i < n; i++) {
      const ang = 0.9 + Math.random() * 0.55;   // radians above horizontal: up and in towards the middle
      const sp = (0.9 + Math.random() * 0.7) * Math.max(H(), 500) * 1.5;
      bits.push({
        x: fromLeft ? -10 : W() + 10, y: H() + 10,
        vx: (fromLeft ? 1 : -1) * Math.abs(Math.cos(ang)) * sp * 0.75,
        vy: -Math.abs(Math.sin(ang)) * sp,
        w: 6 + Math.random() * 7, h: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 14,
        flip: Math.random() * Math.PI * 2, flipRate: 6 + Math.random() * 8,
        colour: COLOURS[(Math.random() * COLOURS.length) | 0],
        life: 0,
      });
    }
  };
  fire(true);
  setTimeout(() => fire(false), 140);

  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W(), H());
    for (const b of bits) {
      b.life += dt;
      b.vy += 900 * dt;                        // gravity
      b.vx *= Math.pow(0.35, dt);              // air drag
      b.vy *= Math.pow(0.55, dt);
      b.vx += Math.sin(b.life * 3 + b.flip) * 40 * dt;   // flutter
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      b.flip += b.flipRate * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      g.scale(1, Math.cos(b.flip));            // paper turning over
      g.globalAlpha = Math.max(0, Math.min(1, 6 - b.life));   // fade out at the end
      g.fillStyle = b.colour;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    const alive = bits.some((b) => b.y < H() + 30 && b.life < 6);
    if (alive) requestAnimationFrame(step);
    else { removeEventListener('resize', size); c.remove(); running = false; }
  };
  requestAnimationFrame(step);
}
