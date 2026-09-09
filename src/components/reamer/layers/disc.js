// Orbital particle disc — the site's single persistent object.
//
// It is never CSS-scaled. Its radius is a continuous function of page
// scroll and the particles are re-projected every frame at the canvas's
// native resolution, so it grows without ever softening. Particle radii
// are stored normalised (0..1 between the void and the outer edge), which
// is what makes the growth read as one smooth push-in instead of a pop.

const PERSPECTIVE = 1300;
const TILT = (12 * Math.PI) / 180;
const SIDEWAY = (158 * Math.PI) / 180;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function createDiscLayer(canvas, { count = 2400 } = {}) {
  const ctx = canvas.getContext("2d", { alpha: true });

  let W = 0;
  let H = 0;
  let dpr = 1;

  const ang = new Float32Array(count);
  const rn = new Float32Array(count);
  const hn = new Float32Array(count);
  const spd = new Float32Array(count);

  // One in five particles is a "mote": it ignores the disc's radius and
  // keeps its own small orbit, so once the disc has flown past the screen
  // there is still a field drifting behind the content sections.
  const mote = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    ang[i] = Math.random() * Math.PI * 2;
    // Biased outward so the disc reads as a ring with a dense rim.
    rn[i] = Math.pow(Math.random(), 0.62);
    hn[i] = (Math.random() - 0.5) * 0.05;
    spd[i] = 0.72 + Math.random() * 0.6;
    mote[i] = i % 5 === 0 ? 1 : 0;
  }

  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const ps = new Float32Array(count);
  const pa = new Float32Array(count);

  function resize(vw, vh, nextDpr) {
    dpr = nextDpr;
    W = vw;
    H = vh;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(m, dt) {
    if (!W || !H) return;

    const p = m.progressSmooth;
    const base = Math.min(W, H);

    // Two overlapping growth curves: the first carries the push-in through
    // the opening, the second keeps a slow creep running for the rest of
    // the page so no scroll position is ever visually static.
    const g1 = easeInOutCubic(clamp01(p / 0.4));
    const g2 = clamp01((p - 0.4) / 0.6);
    // Finale: having flown through it, you look back and watch it recede.
    const back = easeInOutCubic(clamp01((p - 0.72) / 0.28));

    const outerR =
      base * (0.42 + 1.62 * g1 + 0.75 * g2) * (1 - 0.88 * back);
    // The hole widens faster than the disc late on, so the rim sails off
    // screen instead of parking behind the content as a fixed circle.
    const voidR = outerR * (0.155 + 0.25 * g2 * (1 - back));

    const cx =
      W * (0.685 - 0.185 * g1 + 0.185 * back) + (m.pointerXSmooth - 0.5) * 34;
    const cy =
      H * (0.47 + 0.02 * g1 - 0.06 * back) + (m.pointerYSmooth - 0.5) * 22;

    const tilt = TILT * (1 + 0.55 * Math.sin(p * Math.PI));
    const side = SIDEWAY + p * 0.5 + m.time * 0.004;

    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    const cosS = Math.cos(side);
    const sinS = Math.sin(side);

    // Dim as it swallows the screen so section copy stays readable on top.
    // It never reaches zero — the field keeps drifting behind every section.
    const master = 0.95 - 0.68 * clamp01((p - 0.16) / 0.34) + 0.55 * back;

    // Motion trail: erase toward transparent instead of painting black, so
    // the bloom layer underneath keeps showing through.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    const spin = dt * (0.55 + 0.85 * (1 - g1));

    const late = clamp01((p - 0.28) / 0.3);
    const moteAlpha = 0.72 * late * (1 - 0.5 * back);

    let n = 0;
    for (let i = 0; i < count; i++) {
      const isMote = mote[i] === 1;
      if (isMote && moteAlpha <= 0.01) continue;

      const r = isMote
        ? base * (0.14 + rn[i] * 0.72)
        : voidR + rn[i] * (outerR - voidR);
      // Inner orbits run faster, like a real accretion disc.
      ang[i] += spin * spd[i] * (isMote ? 0.16 : 0.35 + 0.9 * (1 - rn[i]));

      const a = ang[i];
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      const y = hn[i] * outerR;

      const y1 = y * cosT + z * sinT;
      const z1 = -y * sinT + z * cosT;
      const x2 = x * cosS - y1 * sinS;
      const y2 = x * sinS + y1 * cosS;

      const scale = PERSPECTIVE / (PERSPECTIVE + z1);
      const sx = cx + x2 * scale;
      const sy = cy + y2 * scale;

      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;

      px[n] = sx;
      py[n] = sy;
      ps[n] = Math.max(0.4, 1.55 * scale);
      pa[n] = isMote
        ? moteAlpha * (0.35 + 0.65 * scale)
        : master * Math.max(0.28, 1 - ((z1 + outerR) / (2 * outerR)) * 0.5);
      n++;
    }

    // Back half of the disc.
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = pa[i];
      const s = ps[i];
      if (s < 1.5) {
        ctx.fillRect(px[i] - s * 0.5, py[i] - s * 0.5, s, s);
      } else {
        ctx.beginPath();
        ctx.arc(px[i], py[i], s * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Event horizon: a hole punched through the particles with a lit rim.
    if (voidR > 2) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx, cy, voidR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      const rim = ctx.createRadialGradient(
        cx,
        cy,
        voidR * 0.86,
        cx,
        cy,
        voidR * 1.14,
      );
      rim.addColorStop(0, "rgba(242,240,235,0)");
      rim.addColorStop(0.55, `rgba(242,240,235,${0.16 * master})`);
      rim.addColorStop(1, "rgba(242,240,235,0)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, voidR * 1.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function dispose() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { resize, draw, dispose };
}
