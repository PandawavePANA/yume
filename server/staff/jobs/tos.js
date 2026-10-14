// 도윤 — 약관 검토. 후보 회사의 이용약관을 읽고 두 가지를 본다.
//   ① "사람이 일반 회원으로 질문 몇십 개를 넣어 보고, 결과를 그 회사에만 비공개로 알려 주는 일"을 막는 조항이 있는가 → 감사 여부
//   ② 로봇·스크립트 같은 "자동화된 수단" 접속을 막는 조항이 있는가 → 답 수집을 현장 요원(PC)이 할지, 사람이 할지
// 판정 근거가 된 조항은 그대로 인용한다(약관 글에 없는 인용이면 지어낸 것으로 보고 '애매'로 낮춘다).
// 약관 판정은 영업팀장 전결(roster KINDS.tos_verdict.auto) — 확신 높은 '문제없음'과 금지·애매는 바로 반영한다.
import { all, run as exec } from "../../db.js";
import { updateAudit } from "../../auditDesk.js";

const SYSTEM = `당신은 한국 웹서비스 이용약관을 읽는 검토자입니다. 아래 "하려는 일"이 약관상 금지되는지 판단합니다.

하려는 일: 일반 회원으로 가입(또는 비회원)해 서비스 화면에 질문을 한 건씩, 사람 속도로 간격을 두고 12~50개 입력한다.
받은 답을 공개 법령 원문과 대조해, 그 결과를 그 회사에만 비공개 보고서로 알린다. 결과를 공개하거나 다른 곳에 팔지 않는다.
대량 질의·크롤링·데이터 수집은 하지 않는다.

판단:
- "prohibited": 위 일을 직접 금지하는 조항이 있다(예: 서비스 평가·벤치마크·테스트 목적 이용 금지, 결과물의 제3자 제공 금지가 비공개 보고에도 걸리는 경우, 회원 아닌 목적의 이용 금지 등).
- "ok": 크롤링·대량 수집·역설계 금지 같은 조항만 있고, 위 일을 막는 조항이 없다.
- "unclear": 해석이 갈리거나, 약관 본문을 충분히 보지 못했다.
근거 조항은 약관 글에서 그대로 인용하세요(지어내지 말 것).
automation_banned: 로봇·스크립트·매크로·크롤러 등 "자동화된 수단"으로 접속하거나 이용하는 것을 금지하는 조항이 있으면 true(그 조항을 automation_quote에 인용), 없으면 false.
JSON 하나만:
{"verdict":"ok|prohibited|unclear","confidence":"high|medium|low","quote":"근거 조항 원문(없으면 빈칸)","reason":"한두 문장","automation_banned":true,"automation_quote":""}`;

/** 약관 검토를 기다리는 후보(약관 판정 없음, 아직 제외·종료 아님). */
export async function waiting(limit = 3) {
  return all(
    `SELECT * FROM ai_audits
      WHERE tos_verdict IS NULL AND category = 'service' AND stage = 'prospect' AND closed_at IS NULL
        AND (tos_url <> '' OR service_url <> '') AND (tos_render IS NULL OR tos_render NOT IN ('queued','retry'))
      ORDER BY id ASC LIMIT :limit`,
    { limit },
  );
}

/** 약관 본문처럼 보이는가 — 조항 번호가 있거나 '약관'이 여러 번 나오는 충분히 긴 글. 메인 화면을 약관으로 착각하지 않게. */
export const looksLikeTos = (text) => String(text || "").length >= 800 && (/제\s*1\s*조/.test(text) || (String(text).match(/약관/g) || []).length >= 3);

const tosLink = (links) => links.find((l) => /이용\s*약관|서비스\s*약관|terms/i.test(l.text) || /terms|agreement|policy\/service|tos/i.test(l.href));

/** 약관 페이지를 찾는다 — 적어 둔 주소, 아니면 서비스 첫 화면. 읽은 글이 약관이 아니면 그 안의 '이용약관' 링크를 한 번 따라간다. */
async function findTos(audit, readPage) {
  const first = await readPage(audit.tos_url || audit.service_url, { maxChars: 30_000 });
  if (looksLikeTos(first.text)) return first;
  const link = tosLink(first.links);
  if (!link) throw new Error("이용약관 본문이나 링크를 찾지 못했어요.");
  return readPage(link.href);
}

const inText = (text, quote) => !quote || text.replace(/\s+/g, "").includes(quote.replace(/\s+/g, "").slice(0, 40));

export async function run(ctx) {
  const list = await waiting(ctx.cap(3));
  let done = 0;
  for (const a of list) {
    const dedupe = `tos:audit:${a.id}:${a.tos_render || "web"}`;
    if (await ctx.hasProposal(dedupe)) continue;
    let page = null;
    let why = "";
    if (a.tos_render === "done" && a.tos_text) {
      page = { url: a.tos_url || a.service_url, text: a.tos_text, links: [] };
    } else {
      try {
        page = await findTos(a, ctx.deps.readPage);
        if (!looksLikeTos(page.text)) {
          why = `읽은 페이지(${page.url})가 약관 본문이 아니에요`;
          page = null;
        }
      } catch (e) {
        why = e.message;
      }
    }
    if (!page && a.tos_render === "failed") {
      // PC 브라우저로도 못 찾았으면, 웹 검색으로 공식 약관 주소를 찾아 한 번 더 열어 오게 한다.
      const found = await ctx.deps.ai({
        system: "웹 검색으로 한국 웹서비스의 공식 '서비스 이용약관' 페이지 주소를 찾습니다. 그 회사 도메인(또는 회사가 공식으로 쓰는 노션·구글 문서) 주소만. 못 찾으면 빈칸. JSON 하나만: {\"url\":\"\"}",
        user: `회사: ${a.company}\n서비스: ${a.service_name} (${a.service_url})`,
        searches: 2,
        maxTokens: 1500,
        label: "staff:tos-find",
      }).catch(() => ({ json: {}, usd: 0 }));
      const url = String(found.json?.url || "").trim();
      if (/^https?:\/\//.test(url) && url !== a.tos_url) {
        await exec("UPDATE ai_audits SET tos_url = :u, tos_render = 'retry' WHERE id = :id", { id: a.id, u: url.slice(0, 400) });
        await ctx.log(`${a.company} 약관 주소를 검색으로 찾아 현장 요원에게 다시 열어 오게 했어요`, { detail: url, ref: `audit:${a.id}`, costUsd: found.usd });
        continue;
      }
      await exec("UPDATE ai_audits SET tos_render = 'failed2' WHERE id = :id", { id: a.id });
      a.tos_render = "failed2";
    }
    if (!page) {
      // 서버가 못 읽는 페이지(스크립트로 그리는 사이트)는 대표 PC의 현장 요원이 진짜 브라우저로 열어 온다.
      if (!a.tos_render) {
        await exec("UPDATE ai_audits SET tos_render = 'queued' WHERE id = :id", { id: a.id });
        await ctx.log(`${a.company} 약관을 서버에서 못 읽어 현장 요원(PC 브라우저)에게 열어 오게 했어요`, { detail: why, ref: `audit:${a.id}` });
        continue;
      }
      await ctx.propose({
        kind: "tos_verdict",
        title: `약관 확인 필요 — ${a.company}`,
        summary: `서버와 PC 브라우저 모두 약관 본문을 찾지 못했어요. ${why}`,
        payload: { auditId: Number(a.id), verdict: null, manual: true },
        ref: `audit:${a.id}`,
        dedupe,
      });
      await ctx.log(`${a.company} 약관 본문을 끝내 찾지 못해 보류로 두었어요`, { level: "warn", ref: `audit:${a.id}` });
      continue;
    }
    const { json, usd } = await ctx.deps.ai({ system: SYSTEM, user: `서비스: ${a.service_name} (${a.service_url})\n약관 주소: ${page.url}\n\n약관 본문:\n${page.text}`, maxTokens: 1500, label: "staff:tos" });
    const verdict = ["ok", "prohibited", "unclear"].includes(json?.verdict) ? json.verdict : "unclear";
    const quote = String(json?.quote || "").slice(0, 600);
    const quoteReal = inText(page.text, quote);
    const v = quoteReal ? verdict : "unclear";
    const confidence = quoteReal ? json?.confidence || "low" : "low";
    // 자동 접속 금지 조항이 있거나, 없다는 답이 확실하지 않으면 답 수집은 사람이 한다(현장 요원은 금지 조항이 없는 곳에서만).
    const autoQuote = String(json?.automation_quote || "").slice(0, 300);
    const banned = json?.automation_banned !== false || (autoQuote && !inText(page.text, autoQuote));
    const note = [
      `${ctx.staff.name}(AI) 검토 · ${page.url}`,
      `판단: ${v} (확신 ${confidence})`,
      json?.reason || "",
      quote ? `근거: “${quote}”` : "",
      `답 수집: ${banned ? `사람이 직접(자동 접속 금지${autoQuote ? ` — “${autoQuote}”` : " 여부 불확실"})` : "현장 요원 자동(자동 접속 금지 조항 없음)"}`,
    ].filter(Boolean).join("\n");
    const auto = ctx.autonomy === "auto" && (v !== "ok" || confidence === "high");
    if (auto) {
      await updateAudit(a.id, { tos_verdict: v, tos_url: page.url, tos_note: note });
      await setCollectMode(a.id, banned);
      await ctx.log(`${a.company} 약관: ${LABEL[v]} · 답 수집 ${banned ? "사람" : "현장 요원"} (바로 반영)`, { detail: note, ref: `audit:${a.id}`, costUsd: usd });
    } else {
      await ctx.propose({
        kind: "tos_verdict",
        title: `약관 ${LABEL[v]} — ${a.company}`,
        summary: note,
        payload: { auditId: Number(a.id), verdict: v, url: page.url, note, banned },
        ref: `audit:${a.id}`,
        dedupe,
      });
      await ctx.log(`${a.company} 약관을 읽고 판단을 올렸어요 (${LABEL[v]})`, { ref: `audit:${a.id}`, costUsd: usd });
    }
    done += 1;
  }
  return { note: done ? `약관 ${done}건 검토` : "검토할 약관 없음" };
}

export const LABEL = { ok: "문제없음", prohibited: "금지", unclear: "애매" };

/** 답 수집 방법 — 자동 접속 금지면 사람(manual), 아니면 현장 요원(agent). 이미 정해 둔 값은 바꾸지 않는다. */
export function setCollectMode(auditId, banned) {
  return exec("UPDATE ai_audits SET collect_mode = COALESCE(collect_mode, :m) WHERE id = :id", { id: Number(auditId), m: banned ? "manual" : "agent" });
}

/** 전결(또는 결재) — 판정을 감사 건에 반영한다. */
export async function apply(payload) {
  if (!payload?.verdict) {
    // 페이지를 못 읽었으면 감사하지 않는다(애매로 둠) — 대표가 원하면 감사 데스크에서 직접 바꿀 수 있다.
    const r = await updateAudit(payload.auditId, { tos_verdict: "unclear", tos_note: "약관 페이지를 읽지 못해 보류 — 감사하지 않음(필요하면 감사 데스크에서 직접 확인)" });
    return r.error ? { ok: false, result: r.error } : { ok: true, result: "약관을 읽지 못해 보류(애매)로 두고 넘어감" };
  }
  const r = await updateAudit(payload.auditId, { tos_verdict: payload.verdict, tos_url: payload.url || undefined, tos_note: payload.note || "" });
  if (r.error) return { ok: false, result: r.error };
  await setCollectMode(payload.auditId, payload.banned !== false);
  return { ok: true, result: `약관 ${LABEL[payload.verdict]}로 반영 · 답 수집 ${payload.banned !== false ? "사람" : "현장 요원"}` };
}
