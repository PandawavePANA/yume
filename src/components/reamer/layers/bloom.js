// Global light bloom. One shader for the whole site, so every section sits
// in the same lit room instead of each one inventing its own background.
// Its origin tracks the disc, so the light reads as coming *from* the disc.

const VERT = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos,0.0,1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uOrigin;
uniform float uRadius;
uniform float uIntensity;
uniform float uShaft;
uniform float uGrain;
uniform float uVignette;
uniform vec3  uBg;
uniform vec3  uBase;
uniform vec3  uAccent;

float h11(float x){ return fract(sin(x * 127.1) * 43758.5453123); }

float vn1(float x){
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h11(i), h11(i + 1.0), f);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;

  vec2 rel = (uv - uOrigin) * vec2(aspect, 1.0);
  float d = length(rel);

  float breathe = 1.0 + 0.05 * sin(uTime * 0.32);
  float g = exp(-d / max(uRadius * breathe, 0.0001));

  float ang = atan(rel.y, rel.x);
  float s = vn1(ang * 3.0 + uTime * 0.12) * 0.6
          + vn1(ang * 7.3 - uTime * 0.08) * 0.4;
  // Shafts have to die out near the origin, otherwise every ray converges
  // into a hard starburst at the core instead of a soft glow.
  float shaftMask = smoothstep(0.06, 0.52, d);
  g *= mix(1.0, 0.62 + 0.8 * s, uShaft * shaftMask);

  g = clamp(g * uIntensity, 0.0, 1.0);

  vec3 col = mix(uBg, uBase, smoothstep(0.0, 0.8, g));
  col = mix(col, uAccent, smoothstep(0.86, 1.0, g));

  vec2 vc = uv - 0.5;
  vc.x *= aspect;
  col *= 1.0 - uVignette * smoothstep(0.32, 0.98, length(vc));

  float rnd = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (rnd - 0.5) * (uGrain * 0.055 + 1.5 / 255.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const hexToVec3 = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const BG = hexToVec3("#0a0a0a");
const BASE = hexToVec3("#3a3a3a");
const ACCENT = hexToVec3("#d8d6cf");

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

export function createBloomLayer(canvas) {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    powerPreference: "low-power",
  });
  if (!gl) return { resize() {}, draw() {}, dispose() {} };

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(program, name);
  const U = {
    res: u("uRes"),
    time: u("uTime"),
    origin: u("uOrigin"),
    radius: u("uRadius"),
    intensity: u("uIntensity"),
    shaft: u("uShaft"),
    grain: u("uGrain"),
    vignette: u("uVignette"),
    bg: u("uBg"),
    base: u("uBase"),
    accent: u("uAccent"),
  };

  let W = 0;
  let H = 0;

  function resize(vw, vh, dpr) {
    const scale = Math.min(dpr, 1.5);
    W = Math.round(vw * scale);
    H = Math.round(vh * scale);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    gl.viewport(0, 0, W, H);
  }

  function draw(m) {
    if (!W || !H) return;

    const p = m.progressSmooth;

    // Sits just off the disc's core so the light grazes it rather than
    // blasting straight through the hole in the middle.
    const g1 = clamp01(p / 0.4);
    const back = clamp01((p - 0.72) / 0.28);
    const ox =
      0.685 - 0.185 * g1 + 0.185 * back - 0.09 + (m.pointerXSmooth - 0.5) * 0.12;
    const oy =
      0.47 + 0.02 * g1 - 0.06 * back - 0.07 + (m.pointerYSmooth - 0.5) * 0.1;

    // Three acts. The opening tightens the light into a visible source;
    // the middle blows the radius out so wide it becomes an even wash that
    // section copy reads against; the finale draws it back in with the
    // disc. Same light throughout — the background never switches.
    const intro = clamp01(p / 0.42);
    const calm = clamp01((p - 0.42) / 0.34);
    const radius =
      (0.2 + 0.44 * intro + 1.05 * calm) * (1 - 0.66 * back) +
      0.08 * m.pointer;
    const intensity =
      0.72 + 0.24 * intro - 0.4 * calm + 0.3 * back +
      0.12 * m.pointer * (1 - calm);

    gl.uniform2f(U.res, W, H);
    gl.uniform1f(U.time, m.time % 3600);
    gl.uniform2f(U.origin, ox, 1 - oy);
    gl.uniform1f(U.radius, radius);
    gl.uniform1f(U.intensity, intensity);
    gl.uniform1f(U.shaft, 0.3 * (1 - calm * 0.7));
    gl.uniform1f(U.grain, 0.14);
    gl.uniform1f(U.vignette, 0.42);
    gl.uniform3f(U.bg, BG[0], BG[1], BG[2]);
    gl.uniform3f(U.base, BASE[0], BASE[1], BASE[2]);
    gl.uniform3f(U.accent, ACCENT[0], ACCENT[1], ACCENT[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose() {
    gl.deleteProgram(program);
    gl.deleteBuffer(buf);
  }

  return { resize, draw, dispose };
}
