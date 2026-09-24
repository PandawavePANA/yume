// 스토어 스크린샷 찍기 — 플레이스토어·앱스토어에 올릴 그림을 코드로 만든다.
//
// 손으로 찍으면 화면이 바뀔 때마다 다시 찍어야 하고, 그때마다 기기·글꼴·잘린 위치가
// 달라진다. 앱이 실제로 여는 화면(스토어 빌드 = /app/)을 그대로 띄워서 찍는다.
//
//   node scripts/store-shots.mjs                     # 로그인 없이 찍히는 화면만
//   node scripts/store-shots.mjs --with-result       # 검증을 한 번 돌려 결과 화면까지(과금됨)
//   BASE=http://localhost:8787/app/ node scripts/store-shots.mjs
//
// 크롬을 --remote-debugging-port로 띄우고 CDP로 조작한다. 퍼페티어를 설치하지 않는 이유는
// 이 한 가지 일에 200MB짜리 크로미움을 또 받을 이유가 없어서다(노드 22+의 WebSocket 사용).
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "docs", "app-store", "screenshots", "v2");
const BASE = process.env.BASE || "http://localhost:8787/app/";
const WITH_RESULT = process.argv.includes("--with-result");

// 플레이 휴대전화 스크린샷 권장 크기. 폰 레이아웃이 나와야 하므로 CSS 폭은 360으로 두고
// 3배로 그려 1080×1920을 만든다 — 1080을 CSS 폭으로 주면 태블릿 화면이 찍힌다.
const CSS = { width: 360, height: 640, scale: 3 };

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("크롬/엣지를 찾지 못했습니다.");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openChrome() {
  const userDir = path.join(__dirname, "..", ".tmp-shots-profile");
  const proc = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=9333",
    `--user-data-dir=${userDir}`, "--no-first-run", "--window-size=400,800", "about:blank",
  ], { stdio: "ignore" });
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch("http://127.0.0.1:9333/json/version");
      if (r.ok) return { proc, userDir, ws: (await r.json()).webSocketDebuggerUrl };
    } catch { /* 아직 안 떴다 */ }
    await sleep(250);
  }
  throw new Error("크롬이 디버깅 포트를 열지 않았습니다.");
}

// CDP는 WebSocket 위의 JSON-RPC다. 필요한 만큼만 감싼다.
function connect(url) {
  const ws = new WebSocket(url);
  const waiting = new Map();
  let id = 0;
  const ready = new Promise((res) => ws.addEventListener("open", res));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  const send = async (method, params = {}, sessionId) => {
    await ready;
    id += 1;
    const mine = id;
    return new Promise((res, rej) => {
      waiting.set(mine, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
      ws.send(JSON.stringify({ id: mine, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  return { send, close: () => ws.close() };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { proc, userDir, ws } = await openChrome();
  const cdp = connect(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const call = (m, p) => cdp.send(m, p, sessionId);

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: CSS.width, height: CSS.height, deviceScaleFactor: CSS.scale, mobile: true,
  });

  const evaluate = async (expression) =>
    (await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;

  const shoot = async (name) => {
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`  ${name}.png`);
  };

  const go = async (url) => {
    await call("Page.navigate", { url });
    await sleep(2500);
  };

  console.log(`찍는 중 — ${BASE} (${CSS.width * CSS.scale}×${CSS.height * CSS.scale})`);

  // 1. 첫 화면
  await go(BASE);
  await evaluate("document.querySelectorAll('[data-anim]').length");
  await sleep(1500);
  await shoot("01-home");

  // 2. AI 답변을 붙여넣은 상태
  const SAMPLE = "대법원 2019다12345 판결에 따르면 임차인은 계약 만료 6개월 전까지 갱신을 요구할 수 있으며, 주택임대차보호법 제6조의3 제1항이 이를 규정하고 있습니다.";
  await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return 'no-textarea';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(SAMPLE)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 상단 바가 잘리지 않게 카드 머리에 맞춘다 — 스토어 그림에서 잘린 글자는 반려 사유가 된다.
    const card = ta.closest('div[style*="border-radius"]') || ta;
    window.scrollTo(0, Math.max(0, card.getBoundingClientRect().top + window.scrollY - 76));
    return 'ok';
  })()`);
  await sleep(900);
  await shoot("02-input");

  // 옆 패널(랭킹·채팅)은 로그인 전에는 빈 화면이라 스토어 그림으로 쓰지 않는다.

  // 4. 검증 결과 — 실제로 한 번 돌린다(과금). 없으면 건너뛴다.
  if (WITH_RESULT) {
    console.log("  검증 실행 중… (최대 2분)");
    const clicked = await evaluate(`(() => {
      const btn = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "유메로 확인하기");
      if (!btn) return "no-button";
      if (btn.disabled) return "disabled";
      btn.click();
      return "clicked";
    })()`);
    console.log("   버튼:", clicked);
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '유메로 확인하기');
      if (!btn) return 'no-button';
      if (btn.disabled) return 'disabled';
      btn.click();
      return 'clicked';
    })()`);
    // "확인하는 중"이 사라지는 것으로 끝을 판단한다. 결과 문구(확인됨·판정 등)로 재면
    // 아래쪽 소개 글에 같은 낱말이 있어서 시작하자마자 끝난 줄 안다 — 실제로 한 번 겪었다.
    let shotLoading = false;
    for (let i = 0; i < 90; i += 1) {
      await sleep(2000);
      const loading = await evaluate("/확인하는 중/.test(document.body.innerText)");
      if (loading && !shotLoading && i >= 2) { await shoot("03-checking"); shotLoading = true; }
      if (!loading && i > 2) break;
      if (i % 5 === 0) {
        const t = await evaluate("document.body.innerText.replace(/\s+/g, ' ').slice(0, 90)");
        console.log("    …", i * 2, "초 |", t);
      }
    }
    await sleep(1800);
    await evaluate("window.scrollTo(0, 0)");
    await sleep(600);
    await shoot("05-result");
    // 결과 아래 근거·출처까지
    // 근거·출처가 있는 자리로 내린다.
    await evaluate(`(() => {
      const el = [...document.querySelectorAll("*")].find(n => /근거|출처/.test(n.textContent || "") && n.children.length < 6);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90);
      else window.scrollTo(0, 700);
      return true;
    })()`);
    await sleep(700);
    await shoot("06-sources");
  }

  cdp.close();
  proc.kill();
  console.log(`\n저장 위치: ${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
