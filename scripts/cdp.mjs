// 설치된 Edge를 DevTools 프로토콜로 다루는 공용 부품 — 감사 러너(audit-runner.mjs)와 현장 요원(field-agent.mjs)이 같이 쓴다.
// 프로필은 대표가 직접 로그인해 둔 전용 프로필(%LOCALAPPDATA%\yume-audit-browser) 하나다 — 비밀번호를 스크립트에 넣지 않는다.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PROFILE = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "yume-audit-browser");
export const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isUp = (port) => fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok).catch(() => false);

/** Edge를 띄운다(이미 떠 있으면 그대로). headless면 화면에 창이 뜨지 않는다 — 대표가 PC를 쓰는 데 방해되지 않게. */
export async function launchEdge({ port, url = "about:blank", headless = false, profile = PROFILE }) {
  if (await isUp(port)) return;
  if (!EDGE) throw new Error("Microsoft Edge를 찾을 수 없어요.");
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1100,1300"];
  if (headless) args.push("--headless=new", "--disable-gpu");
  spawn(EDGE, [...args, url], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 60 && !(await isUp(port)); i++) await sleep(500);
  if (!(await isUp(port))) throw new Error("Edge가 응답하지 않아요(같은 프로필을 쓰는 창이 이미 열려 있을 수 있어요).");
}

/** 그 브라우저를 닫는다(전용 프로필을 다른 창이 쓰게 하려면 먼저 닫아야 한다). */
export async function closeEdge(port) {
  try {
    const v = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const b = await connect(v.webSocketDebuggerUrl);
    await b.send("Browser.close").catch(() => {});
    b.close();
  } catch {
    /* 이미 꺼짐 */
  }
  for (let i = 0; i < 20 && (await isUp(port)); i++) await sleep(300);
}

/** host가 열린 탭(없으면 새 탭)에 붙는다. */
export async function pageFor({ port, url, host }) {
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  let page = pages.find((p) => p.type === "page" && host && p.url.includes(host));
  if (!page) {
    page = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((r) => r.json());
    await sleep(3000);
  }
  return connect(page.webSocketDebuggerUrl);
}

export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const waiting = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && waiting.has(msg.id)) {
        const { ok, fail } = waiting.get(msg.id);
        waiting.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
      }
    };
    ws.onerror = () => reject(new Error("브라우저 DevTools에 연결하지 못했어요."));
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((ok, fail) => {
          const id = ++seq;
          waiting.set(id, { ok, fail });
          ws.send(JSON.stringify({ id, method, params }));
        });
      const evaluate = async (expression) => {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "페이지 스크립트 오류");
        return r.result.value;
      };
      // 대화 전체가 보이게 한 장으로. 3MB를 넘으면 화질을 낮춘다(데스크 캡처 한도).
      const capture = async () => {
        await evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await sleep(600);
        for (const quality of [72, 55, 40]) {
          const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality, captureBeyondViewport: true });
          if (Buffer.from(data, "base64").length < 2.8 * 1024 * 1024) return `data:image/jpeg;base64,${data}`;
        }
        const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
        return `data:image/jpeg;base64,${data}`;
      };
      // 진짜 Enter 키(사이트가 합성 이벤트를 무시할 때).
      const pressEnter = async () => {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      };
      const navigate = async (url) => {
        await send("Page.navigate", { url });
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          if ((await evaluate("document.readyState").catch(() => "")) === "complete") break;
        }
        await sleep(2500);
      };
      resolve({ send, evaluate, capture, pressEnter, navigate, close: () => ws.close() });
    };
  });
}
