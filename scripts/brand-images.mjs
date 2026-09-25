// 제출용 리머 로고 이미지 만들기.
//
// 요청 규격: 168×168 한 장, 가로 1300 이하(가변)×세로 192 고정 한 장, PNG.
//
// 로고를 이미지 파일에서 늘리지 않고 **벡터 경로에서 다시 그린다**
// (`src/components/reamer/Logo.jsx`와 같은 좌표). 작은 크기로 줄일 때 테두리가 뭉개지지 않고,
// 규격이 바뀌면 숫자만 고쳐 다시 뽑으면 된다.
//
//   node scripts/brand-images.mjs
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "docs", "brand");
const TMP = path.join(__dirname, "..", ".tmp-brand");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("크롬/엣지를 찾지 못했습니다.");

// Logo.jsx와 같은 좌표계(viewBox 0 0 220 220).
const HEX = "M110,64 L149.82,87 L149.82,133 L110,156 L70.18,133 L70.18,87 Z";
const BLADE = "M0,0 C14.86,-7.18 7.82,-23.68 1.56,-35.88 Q-2.50,-20.81 0,0 Z";
const LETTERS = [
  ["R", 110, 40], ["E", 170.89, 75], ["A", 170.89, 145],
  ["M", 110, 180], ["E", 49.11, 145], ["R", 49.11, 75],
];

const MARK_BOX = "64 58 92 104"; // 육각형 + 선 두께만큼의 여백
const mark = ({ size, full, stroke = 5 }) => `
<svg width="${full ? size : Math.round(size * 92 / 104)}" height="${size}" viewBox="${full ? "0 0 220 220" : MARK_BOX}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="${HEX}" stroke="#0A0A0A" stroke-width="${stroke}" stroke-linejoin="round"/>
  ${[0, 60, 120, 180, 240, 300]
    .map((r) => `<path d="${BLADE}" fill="#0A0A0A" transform="translate(110 110) rotate(${r})"/>`)
    .join("\n  ")}
  <circle cx="110" cy="110" r="8" fill="#0A0A0A"/>
  ${full
    ? LETTERS.map(([ch, x, y]) =>
        `<text x="${x}" y="${y}" fill="#0A0A0A" font-family="Consolas, 'JetBrains Mono', ui-monospace, monospace"
           font-size="30" font-weight="600" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${ch}</text>`).join("\n  ")
    : ""}
</svg>`;

// 흰 배경으로 둔다 — 받는 쪽 화면이 흰색일 때 투명 PNG는 테두리가 사라져 보이고,
// 어두운 화면에 올리면 검은 로고가 묻힌다. 어느 쪽에 놓여도 그대로 보이는 쪽을 고른다.
const page = (body, w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${w}px;height:${h}px;background:#FFFFFF;overflow:hidden}
  .wrap{width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:28px}
  .word{font:600 46px/1 Consolas,'JetBrains Mono',ui-monospace,monospace;letter-spacing:.22em;color:#0A0A0A;
        padding-left:.22em}
  .bar{width:1px;height:64px;background:#D8D5CE}
  .site{font:500 20px/1 Consolas,'JetBrains Mono',ui-monospace,monospace;letter-spacing:.14em;color:#6B6A66}
</style></head><body><div class="wrap">${body}</div></body></html>`;

async function shoot(name, html, w, h) {
  const file = path.join(TMP, `${name}.html`);
  await writeFile(file, html, "utf8");
  const out = path.join(OUT, `${name}.png`);
  await new Promise((res, rej) => {
    const p = spawn(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      `--window-size=${w},${h}`, `--screenshot=${out}`, "--virtual-time-budget=4000",
      `file:///${file.replace(/\\/g, "/")}`,
    ], { stdio: "ignore" });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`크롬 종료 코드 ${code}`))));
  });
  const b = await readFile(out);
  console.log(`  ${name}.png — ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}px, ${(b.length / 1024).toFixed(0)}KB`);
}

await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });

// 1) 168×168 — 정사각. 글자까지 들어간 완전한 로고를 쓴다(정사각 자리에 딱 맞는 구성).
await shoot("reamer-168x168", page(mark({ size: 162, full: true, stroke: 6 }), 168, 168), 168, 168);

// 2) 가로 배너 — 세로 192 고정. 정사각 로고를 그대로 늘리면 글자가 멀리 흩어져 읽히지 않으므로,
//    가로 자리에는 마크 + 워드마크로 다시 짠다(사이트 상단과 같은 구성).
// 배너 자리라 폭을 규격 최대(1300)로 쓴다. 가운데 정렬이라 좌·우 어느 쪽으로 잘려도
// 로고가 먼저 남는다.
await shoot(
  "reamer-banner-1300x192",
  page(
    `${mark({ size: 116, full: false, stroke: 8 })}<span class="word">REAMER</span>` +
    `<span class="bar"></span><span class="site">www.d-reamer.com</span>`,
    1300, 192,
  ),
  1300, 192,
);

console.log(`\n저장 위치: ${OUT}`);
