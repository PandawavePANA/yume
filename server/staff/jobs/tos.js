// 도윤 — 약관 검토. 후보 회사의 이용약관을 읽고 "사람이 일반 회원으로 질문 몇십 개를 넣어 보고, 결과를 그 회사에만
// 비공개로 알려 주는 일"을 막는 조항이 있는지 본다. 판정 근거가 된 조항을 그대로 인용해 결재에 올린다.
//
// 약관 판단은 법적 판단이라 기본은 결재 후 반영. 자동 모드에서도 "문제없음"은 확신이 높을 때만 바로 반영하고,
// 금지·애매는 안전한 쪽이라 바로 반영한다(그 회사는 감사하지 않는다).
import { all } from "../../db.js";
import { updateAudit } from "../../auditDesk.js";

const SYSTEM = `당신은 한국 웹서비스 이용약관을 읽는 검토자입니다. 아래 "하려는 일"이 약관상 금지되는지 판단합니다.

하려는 일: 사람이 일반 회원으로 가입(또는 비회원)해 서비스 화면에 질문을 직접 한 건씩, 간격을 두고 12~50개 입력한다.
받은 답을 공개 법령 원문과 대조해, 그 결과를 그 회사에만 비공개 보고서로 알린다. 결과를 공개하거나 다른 곳에 팔지 않는다.
봇·크롤러·대량 자동 질의는 하지 않는다.

판단:
- "prohibited": 위 일을 직접 금지하는 조항이 있다(예: 서비스 평가·벤치마크·테스트 목적 이용 금지, 결과물의 제3자 제공 금지가 비공개 보고에도 걸리는 경우, 회원 아닌 목적의 이용 금지 등).
- "ok": 자동화·크롤링·대량 수집·역설계 금지 같은 조항만 있고(우리는 하지 않음), 위 일을 막는 조항이 없다.
- "unclear": 해석이 갈리거나, 약관 본문을 충분히 보지 못했다.
근거 조항은 약관 글에서 그대로 인용하세요(지어내지 말 것). JSON 하나만:
{"verdict":"ok|prohibited|unclear","confidence":"high|medium|low","quote":"근거 조항 원문(없으면 빈칸)","reason":"한두 문장"}`;

/** 약관 검토를 기다리는 후보(약관 판정 없음, 아직 제외·종료 아님). */
export async function waiting(limit = 3) {
  return all(
    `SELECT * FROM ai_audits
      WHERE tos_verdict IS NULL AND category = 'service' AND stage = 'prospect' AND closed_at IS NULL
        AND (tos_url <> '' OR service_url <> '')
      ORDER BY id ASC LIMIT :limit`,
    { limit },
  );
}

/** 약관 페이지를 찾는다 — 적어 둔 주소가 있으면 그것, 없으면 서비스 첫 화면의 '약관' 링크. */
async function findTos(audit, readPage) {
  if (audit.tos_url) return readPage(audit.tos_url);
  const home = await readPage(audit.service_url, { maxChars: 4000 });
  const link = home.links.find((l) => /이용\s*약관|서비스\s*약관|terms/i.test(l.text) || /terms|agreement|policy\/service|tos/i.test(l.href));
  if (!link) throw new Error("첫 화면에서 이용약관 링크를 찾지 못했어요.");
  return readPage(link.href);
}

export async function run(ctx) {
  const list = await waiting(ctx.cap(3));
  let done = 0;
  for (const a of list) {
    const dedupe = `tos:audit:${a.id}`;
    if (await ctx.hasProposal(dedupe)) continue;
    let page;
    try {
      page = await findTos(a, ctx.deps.readPage);
    } catch (e) {
      await ctx.propose({
        kind: "tos_verdict",
        title: `약관 확인 필요 — ${a.company}`,
        summary: `약관 페이지를 열지 못했어요: ${e.message}\n감사 데스크에서 직접 약관을 확인해 주세요.`,
        payload: { auditId: Number(a.id), verdict: null, manual: true },
        ref: `audit:${a.id}`,
        dedupe,
      });
      await ctx.log(`${a.company} 약관 페이지를 찾지 못해 대표 확인으로 넘겼어요`, { level: "warn", ref: `audit:${a.id}` });
      continue;
    }
    if (page.text.length < 300) {
      await ctx.propose({
        kind: "tos_verdict",
        title: `약관 확인 필요 — ${a.company}`,
        summary: `약관 페이지(${page.url})에 읽을 글이 거의 없어요(화면을 스크립트로 그리는 사이트일 수 있음). 직접 확인해 주세요.`,
        payload: { auditId: Number(a.id), verdict: null, manual: true, url: page.url },
        ref: `audit:${a.id}`,
        dedupe,
      });
      continue;
    }
    const { json, usd } = await ctx.deps.ai({ system: SYSTEM, user: `서비스: ${a.service_name} (${a.service_url})\n약관 주소: ${page.url}\n\n약관 본문:\n${page.text}`, maxTokens: 1500, label: "staff:tos" });
    const verdict = ["ok", "prohibited", "unclear"].includes(json?.verdict) ? json.verdict : "unclear";
    const quote = String(json?.quote || "").slice(0, 600);
    // 인용이 실제 약관 글에 없으면 지어낸 것이다 — 그때는 "애매"로 낮춘다.
    const quoteReal = !quote || page.text.replace(/\s+/g, "").includes(quote.replace(/\s+/g, "").slice(0, 40));
    const v = quoteReal ? verdict : "unclear";
    const confidence = quoteReal ? json?.confidence || "low" : "low";
    const note = `${ctx.staff.name}(AI) 검토 · ${page.url}\n판단: ${v} (확신 ${confidence})\n${json?.reason || ""}${quote ? `\n근거: “${quote}”` : ""}`;
    const auto = ctx.autonomy === "auto" && (v !== "ok" || confidence === "high");
    if (auto) {
      await updateAudit(a.id, { tos_verdict: v, tos_url: page.url, tos_note: note });
      await ctx.log(`${a.company} 약관: ${LABEL[v]} (자동 반영)`, { detail: note, ref: `audit:${a.id}`, costUsd: usd });
    } else {
      await ctx.propose({
        kind: "tos_verdict",
        title: `약관 ${LABEL[v]} — ${a.company}`,
        summary: note,
        payload: { auditId: Number(a.id), verdict: v, url: page.url, note },
        ref: `audit:${a.id}`,
        dedupe,
      });
      await ctx.log(`${a.company} 약관을 읽고 판단을 결재에 올렸어요 (${LABEL[v]})`, { ref: `audit:${a.id}`, costUsd: usd });
    }
    done += 1;
  }
  return { note: done ? `약관 ${done}건 검토` : "검토할 약관 없음" };
}

export const LABEL = { ok: "문제없음", prohibited: "금지", unclear: "애매" };

/** 결재 승인 — 판정을 감사 건에 반영한다. */
export async function apply(payload) {
  // 페이지를 못 읽은 건 — 승인은 "데스크에서 직접 보겠다"는 뜻이라 결재만 닫는다.
  if (!payload?.verdict) {
    // 페이지를 못 읽었으면 감사하지 않는다(애매로 둠) — 대표가 원하면 데스크에서 직접 바꿀 수 있다.
    const r = await updateAudit(payload.auditId, { tos_verdict: "unclear", tos_note: "약관 페이지를 읽지 못해 보류 — 감사하지 않음(필요하면 감사 데스크에서 직접 확인)" });
    return r.error ? { ok: false, result: r.error } : { ok: true, result: "약관을 읽지 못해 보류(애매)로 두고 넘어감" };
  }
  const r = await updateAudit(payload.auditId, { tos_verdict: payload.verdict, tos_url: payload.url || undefined, tos_note: `${payload.note || ""}\n(대표 승인)` });
  return r.error ? { ok: false, result: r.error } : { ok: true, result: `약관 ${LABEL[payload.verdict]}로 반영` };
}
