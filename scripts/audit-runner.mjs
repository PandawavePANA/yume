// 감사 러너 — 상대 AI 서비스 화면에 질문을 한 건씩 넣고, 답 텍스트·받은 시각·화면 캡처를 감사 데스크에 바로 남긴다.
//
// 왜 필요한가(2026-10-13 로무앤톡 2차 감사): 질문은 브라우저로 했지만 화면 캡처를 따로 남기지 않았고, 그 서비스는
// 대화 기록이 남지 않는 데다 크레딧도 다 써서, 보고서를 다 만든 뒤에야 대표 사례 캡처를 만들 수 없다는 걸 알았다.
// 이 러너는 답을 받는 그 순간 캡처를 찍어 데스크에 올린다 — 텍스트만 남고 증거가 사라지는 일이 다시 없게.
//
// 원칙(감사 데스크와 같다)
//   · 사람이 하는 일만 한다: 한 건씩, 사람 속도로(기본 20~40초 간격). 대량 자동 질의를 하지 않는다.
//   · 로그인은 사람이 한다: 처음 한 번 --login으로 창을 열어 직접 로그인하면, 전용 프로필에 남아 다음부터 쓴다.
//     비밀번호를 이 스크립트에 넣지 않는다.
//   · 크레딧이 모자라면 멈춘다: 남은 크레딧이 이번 질문(이어 보내는 말 포함)에 모자라면 시작하지 않는다.
//   · 상대 화면을 고치지 않는다: 캡처는 화면 그대로.
//
// 사용법(운영 DB에 바로 기록하려면 railway run으로 실행):
//   railway run --service yume node scripts/audit-runner.mjs --site lawmutok --login          # 처음 한 번: 창 열고 로그인
//   railway run --service yume node scripts/audit-runner.mjs --site lawmutok --audit 22       # 답 없는 질문을 차례로
//   옵션: --limit 5 (최대 몇 개)  --gap 20-40 (질문 간격 초)  --grade (끝나면 채점 시작)  --dry (보내지 않고 계획만)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { SITES } from "./audit-sites.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const site = SITES[args.site];
if (!site) {
  console.error(`--site 를 정해 주세요: ${Object.keys(SITES).join(", ")}`);
  process.exit(1);
}
const PORT = Number(args.port || 9333);
const PROFILE = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "yume-audit-browser");
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const [gapMin, gapMax] = String(args.gap || "20-40").split("-").map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DevTools 연결 ─────────────────────────────────────────────────────
async function openBrowser() {
  const up = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok).catch(() => false);
  if (!up) {
    if (!EDGE) throw new Error("Microsoft Edge를 찾을 수 없어요.");
    spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--window-size=1100,1300", site.url], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 40 && !(await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok).catch(() => false)); i++) await sleep(500);
  }
  const pages = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  let page = pages.find((p) => p.type === "page" && p.url.includes(site.host));
  if (!page) {
    page = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(site.url)}`, { method: "PUT" }).then((r) => r.json());
    await sleep(3000);
  }
  return connect(page.webSocketDebuggerUrl);
}

function connect(wsUrl) {
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
      resolve({ send, evaluate, capture, close: () => ws.close() });
    };
  });
}

// 답이 끝날 때까지 — 마무리 표시가 나오거나, 6초 동안 글자가 늘지 않으면 끝으로 본다(최대 3분).
async function waitAnswer(b, tail) {
  let last = "";
  let still = 0;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const text = await b.evaluate(site.answer(tail));
    if (text && (await b.evaluate(site.done(tail)))) return text;
    if (text && text === last && text.length > 30) {
      if (++still >= 3) return text;
    } else still = 0;
    last = text || "";
  }
  return last || null;
}

const tailOf = (s) => String(s).replace(/\n+/g, " ").trim().slice(-14);

// ── 실행 ─────────────────────────────────────────────────────────────
const b = await openBrowser();
// 캡처만 시험(크레딧을 쓰지 않는다): 지금 화면을 파일로 저장하고 끝낸다.
if (args.shot) {
  const img = await b.capture();
  fs.writeFileSync(String(args.shot), Buffer.from(img.split(",")[1], "base64"));
  console.log(`캡처 저장: ${args.shot} · 남은 크레딧: ${await b.evaluate(site.credits())}`);
  b.close();
  process.exit(0);
}
if (args.login) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`열린 창에서 ${site.label}에 로그인한 뒤 Enter를 누르세요(로그인은 전용 프로필에 남습니다): `);
  rl.close();
  console.log(`남은 크레딧: ${await b.evaluate(site.credits())}`);
  b.close();
  process.exit(0);
}

const auditId = Number(args.audit);
if (!auditId) {
  console.error("--audit 감사 번호를 정해 주세요.");
  process.exit(1);
}
const { all } = await import("../server/db.js");
const desk = await import("../server/auditDesk.js");
const audit = await desk.auditById(auditId);
if (!audit) throw new Error(`감사 #${auditId}를 찾을 수 없어요.`);
if (audit.tos_verdict !== "ok") throw new Error("약관 확인이 먼저예요 — 감사 데스크에서 '문제없음'으로 적은 뒤 실행하세요.");
if (audit.input_method === "api") throw new Error("공식 API로 묻는 감사예요. 화면 러너가 아니라 API로 질문하세요.");

const todo = await all("SELECT * FROM ai_audit_items WHERE audit_id = :id AND (answer IS NULL OR answer = '') ORDER BY position, id", { id: auditId });
const plan = todo.slice(0, Number(args.limit) || todo.length).map((it) => {
  const p = it.probe_json ? JSON.parse(it.probe_json) : {};
  const followups = Array.isArray(p.followups) ? p.followups : p.followup ? [p.followup] : [];
  return { it, followups, turns: 1 + followups.length };
});
const needCredits = plan.reduce((s, x) => s + x.turns * site.costPerTurn, 0);
console.log(`${site.label} · 감사 #${auditId} · 질문 ${plan.length}개(보낼 말 ${plan.reduce((s, x) => s + x.turns, 0)}번) · 필요 크레딧 약 ${needCredits}`);
if (args.dry) process.exit(0);

let done = 0;
for (const [n, x] of plan.entries()) {
  const credits = await b.evaluate(site.credits());
  if (credits !== null && credits < x.turns * site.costPerTurn) {
    console.log(`멈춤: 남은 크레딧 ${credits} — 이 질문에 ${x.turns * site.costPerTurn} 필요. 충전 후 다시 실행하면 이어서 합니다.`);
    break;
  }
  const r = await b.evaluate(site.ask(x.it.question));
  if (r !== "SENT") throw new Error(`질문을 보내지 못했어요(${r}) — 화면 구조가 바뀌었는지 scripts/audit-sites.mjs를 확인하세요.`);
  const turns = [await waitAnswer(b, tailOf(x.it.question))];
  for (const f of x.followups) {
    await sleep(3000);
    const fr = await b.evaluate(site.follow(f));
    if (fr !== "SENT") throw new Error(`이어서 보내지 못했어요(${fr}).`);
    turns.push(await waitAnswer(b, tailOf(f)));
  }
  const at = Date.now();
  if (turns.some((t) => !t)) {
    console.log(`#${x.it.id} 답을 읽지 못했어요 — 화면을 확인하세요. 건너뜁니다.`);
    continue;
  }
  const image = await b.capture();
  const answer = turns.length > 1 ? turns.map((t, i) => `[답변 ${i + 1}]\n${t}`).join("\n\n") : turns[0];
  const saved = await desk.saveAnswer(x.it.id, { answer, answered_at: at });
  if (saved.error) throw new Error(saved.error);
  const file = await desk.addItemFile(x.it.id, image);
  if (file.error) console.log(`#${x.it.id} 캡처 저장 실패: ${file.error}`);
  done += 1;
  console.log(`✓ ${n + 1}/${plan.length} #${x.it.id} · 답 ${answer.length}자 · 캡처 ${file.error ? "실패" : "저장"} · ${new Date(at).toLocaleTimeString("ko-KR")}`);
  if (n < plan.length - 1) await sleep((gapMin + Math.random() * (gapMax - gapMin)) * 1000);
}
console.log(`끝: ${done}개 기록${args.grade ? " — 채점을 시작합니다" : " (데스크에서 검사를 시작하세요)"}.`);
b.close();
if (args.grade && done) {
  console.log(JSON.stringify(await desk.startChecks(auditId)));
  // 채점은 이 프로세스 안에서 돈다 — 끝날 때까지 기다렸다가 나간다.
  for (let i = 0; i < 90; i++) {
    await sleep(10000);
    const rows = await all("SELECT status, COUNT(*)::int AS n FROM ai_audit_items WHERE audit_id = :id GROUP BY status", { id: auditId });
    const s = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    if (!s.checking && !s.answered) {
      console.log(`채점 끝: ${JSON.stringify(s)}`);
      break;
    }
  }
}
process.exit(0);
