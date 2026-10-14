// 현장 요원 — 대표 PC에서 근무 시간(06:00~19:30) 동안 계속 돌며, 감사팀이 맡긴 답 수집을 한다.
//
// 무엇을 하나: 감사 데스크에서 collect_status = 'queued'인 감사(약관에 자동 접속 금지 조항이 없다고 법무팀이 본 곳)를 하나씩
// 집어, 전용 Edge 프로필로 그 서비스 화면에 질문을 한 건씩 넣고, 답 텍스트·받은 시각·화면 캡처를 데스크에 저장한다.
// 다 넣으면 감사팀(하린)이 채점을 이어 가고, QA(수아)·영업(지호)까지 알아서 흘러간다.
//
// 원칙(감사 러너와 같다)
//   · 사람 속도로 한 건씩(질문 사이 25~45초), 질문마다 새 화면에서. 대량 질의·크롤링을 하지 않는다.
//   · 로그인·회원가입은 대표가 한다. 로그인 화면이 나오면 멈추고 대표에게 "가입·로그인 필요" 결재를 올린다(--open으로 창을 열어 가입).
//   · 화면에서 입력창을 못 찾거나 답이 안 나오면 멈추고 "막힘" 결재를 올린다. 억지로 되풀이하지 않는다.
//   · 창은 화면에 띄우지 않는다(headless) — 대표가 PC를 쓰는 데 방해되지 않게. 프로필(로그인)은 같은 것을 쓴다.
//
// 실행(운영 DB에 바로 기록 — railway run으로):
//   railway run --service yume node scripts/field-agent.mjs              # 계속 돌기(바탕화면 '유메 현장요원 시작')
//   railway run --service yume node scripts/field-agent.mjs --open 31    # 감사 #31 서비스를 보이는 창으로 열기(가입·로그인용)
//   옵션: --once(한 건만 하고 끝)  --now(근무 시간 밖이어도)  --show(창을 보이게)
import readline from "node:readline/promises";
import { closeEdge, launchEdge, pageFor, sleep } from "./cdp.mjs";
import { siteFor } from "./audit-sites.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const PORT = 9334;
const WORK = [6 * 60, 19 * 60 + 30];
const GAP = [25, 45];

const { all, one, run } = await import("../server/db.js");
const desk = await import("../server/auditDesk.js");

const kstMinutes = () => {
  const k = new Date(Date.now() + 9 * 3600_000);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
};
const atWork = () => args.now || (kstMinutes() >= WORK[0] && kstMinutes() < WORK[1]);
const beat = (status) => Promise.all([desk.setSetting("field_agent:heartbeat", String(Date.now())), desk.setSetting("field_agent:status", status)]).catch(() => {});
const log = (...a) => console.log(new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 19), ...a);
const tailOf = (s) => String(s).replace(/\n+/g, " ").trim().slice(-14);

// ── 가입·로그인용: 보이는 창으로 열기 ───────────────────────────────────
if (args.open) {
  const a = await desk.auditById(Number(args.open));
  if (!a) throw new Error(`감사 #${args.open}를 찾을 수 없어요.`);
  await closeEdge(PORT); // 같은 프로필을 쓰는 숨은 창을 먼저 닫는다
  await launchEdge({ port: PORT, url: a.service_url, headless: false });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`열린 창에서 ${a.company}(${a.service_url})에 가입·로그인한 뒤 Enter를 누르세요. 로그인은 전용 프로필에 남습니다: `);
  rl.close();
  await closeEdge(PORT);
  await run("UPDATE ai_audits SET collect_status = 'queued', collect_note = NULL, collect_at = :t WHERE id = :id AND collect_status IN ('login_required','failed')", { id: a.id, t: Date.now() });
  console.log("로그인을 저장했어요. 현장 요원이 다음 차례에 이어서 질문을 넣습니다.");
  process.exit(0);
}

/** 맡을 감사 하나를 잡는다(두 대가 같은 일을 잡지 않게 바꿀 때 조건을 건다). 유료 주문 먼저. */
async function claim() {
  const a = await one(
    `SELECT * FROM ai_audits WHERE collect_status = 'queued' AND closed_at IS NULL
      ORDER BY (found_via LIKE '유료 주문%') DESC, collect_at ASC, id ASC LIMIT 1`,
  );
  if (!a) return null;
  const r = await run("UPDATE ai_audits SET collect_status = 'running', collect_at = :t WHERE id = :id AND collect_status = 'queued'", { id: a.id, t: Date.now() });
  return r.changes ? a : null;
}

const stop = (id, status, note) =>
  run("UPDATE ai_audits SET collect_status = :s, collect_note = :n, collect_at = :t WHERE id = :id", { id, s: status, n: String(note).slice(0, 1000), t: Date.now() });

async function waitAnswer(b, site, tail) {
  let last = "";
  let still = 0;
  for (let i = 0; i < 75; i++) {
    await sleep(2000);
    const text = await b.evaluate(site.answer(tail)).catch(() => null);
    if (text && (await b.evaluate(site.done(tail)).catch(() => false))) return text;
    if (text && text === last && text.length > 30) {
      if (++still >= 3) return text;
    } else still = 0;
    last = text || "";
  }
  return last.length > 30 ? last : null;
}

async function send(b, site, text, fresh) {
  if (fresh && site.generic) await b.navigate(site.url); // 질문마다 새 화면(앞 질문의 맥락이 섞이지 않게)
  let r = await b.evaluate(fresh ? site.ask(text) : site.follow(text));
  if (r === "NEED_ENTER") {
    await b.pressEnter();
    r = "SENT";
  }
  if (r !== "SENT") return r;
  // 질문이 화면에 실제로 올라갔는지(보내기가 먹혔는지) 확인한다.
  for (let i = 0; i < 8; i++) {
    await sleep(1000);
    if (await b.evaluate(`document.body.innerText.includes(${JSON.stringify(tailOf(text))})`).catch(() => false)) return "SENT";
  }
  return "NOT_SENT";
}

async function collect(a) {
  const site = siteFor(a.service_url);
  await launchEdge({ port: PORT, url: "about:blank", headless: !args.show });
  const b = await pageFor({ port: PORT, url: a.service_url, host: site.host });
  await b.navigate(a.service_url);
  const todo = await all("SELECT * FROM ai_audit_items WHERE audit_id = :id AND (answer IS NULL OR answer = '') ORDER BY position, id", { id: a.id });
  log(`감사 #${a.id} ${a.company} · 질문 ${todo.length}개 · ${site.generic ? "범용 화면" : site.label}`);
  let done = 0;
  for (const [n, it] of todo.entries()) {
    await beat(`수집 중 — ${a.company} ${n + 1}/${todo.length}`);
    if (!atWork()) {
      await stop(a.id, "queued", "퇴근 시간이라 멈춤 — 내일 이어서");
      break;
    }
    const credits = await b.evaluate(site.credits()).catch(() => null);
    if (credits !== null && credits < site.costPerTurn) {
      await stop(a.id, "failed", `크레딧이 모자라요(남은 ${credits}). 충전하면 이어서 합니다.`);
      b.close();
      return;
    }
    const p = it.probe_json ? JSON.parse(it.probe_json) : {};
    const followups = Array.isArray(p.followups) ? p.followups : p.followup ? [p.followup] : [];
    const r = await send(b, site, it.question, true);
    if (r === "LOGIN") {
      await stop(a.id, "login_required", `${a.service_url} 에서 로그인(또는 회원가입) 화면이 나왔어요.`);
      b.close();
      return;
    }
    if (r !== "SENT") {
      await stop(a.id, "failed", `질문을 넣지 못했어요(${r}) — 화면에서 입력창·보내기 버튼을 찾지 못했어요. 이 서비스는 사람이 넣거나 전용 설정(scripts/audit-sites.mjs)이 필요합니다.`);
      b.close();
      return;
    }
    const turns = [await waitAnswer(b, site, tailOf(it.question))];
    for (const f of followups) {
      await sleep(3000);
      const fr = await send(b, site, f, false);
      turns.push(fr === "SENT" ? await waitAnswer(b, site, tailOf(f)) : null);
    }
    if (turns.some((t) => !t)) {
      await stop(a.id, "failed", `#${it.id} 질문의 답을 읽지 못했어요(답이 안 나오거나 화면 구조가 다름).`);
      b.close();
      return;
    }
    const at = Date.now();
    const image = await b.capture();
    const answer = turns.length > 1 ? turns.map((t, i) => `[답변 ${i + 1}]\n${t}`).join("\n\n") : turns[0];
    const saved = await desk.saveAnswer(it.id, { answer, answered_at: at });
    if (saved.error) throw new Error(saved.error);
    const file = await desk.addItemFile(it.id, image);
    done += 1;
    log(`  ✓ ${n + 1}/${todo.length} #${it.id} · 답 ${answer.length}자 · 캡처 ${file.error ? "실패" : "저장"}`);
    if (n < todo.length - 1) await sleep((GAP[0] + Math.random() * (GAP[1] - GAP[0])) * 1000);
  }
  b.close();
  const left = await one("SELECT COUNT(*) AS n FROM ai_audit_items WHERE audit_id = :id AND (answer IS NULL OR answer = '')", { id: a.id });
  if (!Number(left.n)) {
    await run("UPDATE ai_audits SET collect_status = 'done', collect_note = NULL, input_method = 'browser', collect_at = :t WHERE id = :id", { id: a.id, t: Date.now() });
    log(`감사 #${a.id} 끝 — 답 ${done}개 저장. 감사팀이 채점을 이어 갑니다.`);
  }
}

// ── 약관 페이지 열어 오기 ─────────────────────────────────────────────
// 서버가 못 읽는 약관(스크립트로 그리는 사이트)을 진짜 브라우저로 열어, 보이는 글을 그대로 가져온다. 질문은 넣지 않는다.
const looksLikeTos = (text) => String(text || "").length >= 800 && (/제\s*1\s*조/.test(text) || (String(text).match(/약관/g) || []).length >= 3);

async function renderTos(a) {
  await beat(`약관 열어 오는 중 — ${a.company}`);
  const start = a.tos_url || a.service_url;
  let host = "";
  try {
    host = new URL(start).hostname;
  } catch {
    /* 주소가 이상하면 아래에서 실패로 남는다 */
  }
  try {
    await launchEdge({ port: PORT, url: "about:blank", headless: !args.show });
    const b = await pageFor({ port: PORT, url: start, host });
    await b.navigate(start);
    let text = await b.evaluate("document.body.innerText");
    if (!looksLikeTos(text)) {
      // '이용약관' 링크(또는 버튼)를 한 번 따라간다 — 새 탭으로 열리는 링크는 주소로 이동한다.
      const href = await b.evaluate(`(() => {
        const el = [...document.querySelectorAll("a, button")].find((x) => /이용\\s*약관|서비스\\s*약관|terms of (service|use)/i.test(x.innerText || ""));
        if (!el) return null;
        if (el.href) return el.href;
        el.click();
        return "CLICKED";
      })()`);
      if (href && href !== "CLICKED") await b.navigate(href);
      else if (href === "CLICKED") await sleep(3000);
      text = await b.evaluate("document.body.innerText");
    }
    const url = await b.evaluate("location.href");
    b.close();
    if (looksLikeTos(text)) {
      await run("UPDATE ai_audits SET tos_text = :tx, tos_render = 'done', tos_url = :u WHERE id = :id", { id: a.id, tx: String(text).slice(0, 40_000), u: url });
      log(`약관 가져옴 — #${a.id} ${a.company} (${String(text).length}자)`);
    } else {
      await run("UPDATE ai_audits SET tos_render = 'failed' WHERE id = :id", { id: a.id });
      log(`약관 못 찾음 — #${a.id} ${a.company}`);
    }
  } catch (e) {
    await run("UPDATE ai_audits SET tos_render = 'failed' WHERE id = :id", { id: a.id });
    log(`약관 열기 오류 — #${a.id}: ${e.message}`);
  }
}

// ── 근무 ─────────────────────────────────────────────────────────────
log(`현장 요원 시작 — 근무 06:00~19:30(한국 시각). 창은 ${args.show ? "보이게" : "숨겨서"} 엽니다. 끄려면 이 창을 닫으세요.`);
for (;;) {
  if (!atWork()) {
    await beat("퇴근 — 06:00에 다시 시작");
    await closeEdge(PORT);
    await sleep(5 * 60_000);
    continue;
  }
  await beat("대기 — 맡을 답 수집을 기다리는 중");
  // 약관 열어 오기가 먼저다(짧고, 이게 끝나야 법무팀이 감사 여부를 정한다).
  const t = await one("SELECT * FROM ai_audits WHERE tos_render = 'queued' AND closed_at IS NULL ORDER BY id ASC LIMIT 1");
  if (t) {
    await renderTos(t);
    continue;
  }
  const a = await claim();
  if (!a) {
    if (args.once) break;
    await sleep(2 * 60_000);
    continue;
  }
  try {
    await collect(a);
  } catch (e) {
    log(`감사 #${a.id} 오류: ${e.message}`);
    await stop(a.id, "failed", `현장 요원 오류: ${e.message}`);
  }
  if (args.once) break;
  await sleep(60_000);
}
await beat("멈춤");
process.exit(0);
