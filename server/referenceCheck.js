// 기준 자료(references) — 기업이 보낸 "우리 회사의 사실".
//
// 기업이 검사하는 글의 상당수는 자기 이야기다. 출시일, 요금, 보장 내용, 지점 수, 대표 이름.
// 이런 사실은 공개 웹에 없거나 아주 조금만 있다. 웹만 보고 판정하면 둘 중 하나가 된다 —
// '확인되지 않음'이 끝없이 나오거나, 더 나쁘게는 "기록이 없으니 지어냈다"고 단정한다.
// 실제로 "리머는 2026년 9월 유메를 출시했습니다"가 부존재 판정으로 '사실과 다름'을 받았다.
// 기업 고객이 처음 써 보고 이걸 받으면 그 자리에서 떠난다.
//
// 그래서 기업이 기준이 되는 자료(상품 설명서, 약관, 사내 규정, 보도자료 원문)를 함께 보내면
// 그 자료가 다루는 주장은 **그 자료와 먼저 대조**한다. 법률 주장을 법제처 원문과 대조하는
// 것과 같은 구조다 — 근거는 주어진 원문뿐이고, 원문에 없는 내용은 판단하지 않는다.
//
// 지키는 것 셋.
//   ① 기준 자료에 없는 근거로 판정하지 않는다. 모델이 댄 근거 문장이 기준 자료에 실제로
//      없으면 그 판정은 버리고 '다루지 않음'으로 돌린다(지어낸 근거를 막는 자리).
//   ② 기준 자료로 낸 판정은 그 회사에만 맞는 답이다. 공용 캐시(주장 캐시·결과 캐시)에 넣지 않는다.
//   ③ 기준 자료 자체는 저장하지 않는다. 검증 한 건 동안 메모리에서만 쓴다.
import crypto from "node:crypto";
import { callClaudeJson } from "./claude.js";
import { locateQuote } from "./claimSpan.js";

export const MAX_REFERENCES = 5;
export const MAX_REFERENCE_CHARS = 20_000;
const MAX_ORG = 60;

// 요청에서 받은 기준 자료를 정리한다. 형식이 틀리면 무엇이 틀렸는지 돌려준다(아무것도 시작하지 않는다).
export function normalizeReferences(raw, organization) {
  const org = typeof organization === "string" ? organization.trim().slice(0, MAX_ORG) : "";
  if (raw == null) return { refs: [], organization: org };
  if (!Array.isArray(raw)) return { error: "references는 배열이어야 합니다. 예: [{\"title\":\"상품 설명서\",\"text\":\"...\"}]" };
  if (raw.length > MAX_REFERENCES) return { error: `기준 자료는 ${MAX_REFERENCES}개까지 보낼 수 있습니다.` };
  const refs = [];
  let total = 0;
  for (const [i, r] of raw.entries()) {
    const text = typeof r === "string" ? r.trim() : typeof r?.text === "string" ? r.text.trim() : "";
    if (!text) return { error: `references[${i}]에 text가 없습니다.` };
    const title = (typeof r?.title === "string" && r.title.trim()) || `기준 자료 ${i + 1}`;
    total += text.length;
    refs.push({ title: title.slice(0, 80), text });
  }
  if (total > MAX_REFERENCE_CHARS) {
    return { error: `기준 자료는 합쳐서 ${MAX_REFERENCE_CHARS.toLocaleString()}자 이하여야 합니다(지금 ${total.toLocaleString()}자).` };
  }
  return { refs, organization: org };
}

// 같은 글이라도 기준 자료·자사명이 다르면 결과가 다르다. 결과 캐시를 이 값으로 나눈다.
export function referenceScope(refs = [], organization = "") {
  if (!refs.length && !organization) return "";
  const h = crypto.createHash("sha256");
  h.update(`org:${organization}\n`);
  for (const r of refs) h.update(`${r.title}\n${r.text}\n\u0000`);
  return `ref:${h.digest("hex")}`;
}

const REFERENCE_PROMPT = `당신은 '유메' 팩트체크의 기준 자료 대조 담당입니다. 아래 "기준 자료"는 이 글을 낸 기업이 자기 회사에 관한 사실이라고 제공한 원문입니다. 번호가 붙은 각 주장을 **기준 자료만 근거로** 판단하세요. 배경지식이나 추측을 쓰지 마세요.

- 기준 자료가 그 주장의 내용을 직접 다루고, 주장과 일치하면 "confirmed".
- 기준 자료가 그 주장의 내용을 직접 다루는데 값·조건·주체가 다르면 "false". explanation에 기준 자료가 말하는 실제 값을 쓰세요("기준 자료에 따르면 ○○").
- 기준 자료가 그 주장을 다루지 않으면 "not_covered". 비슷한 주제라도 그 값을 직접 말하지 않으면 not_covered입니다. 애매하면 not_covered가 맞습니다.
- confirmed·false에는 evidence에 근거가 된 기준 자료 문장을 **한 글자도 바꾸지 말고 그대로** 옮기고, ref에 몇 번 자료인지 쓰세요.

반드시 아래 JSON으로만 답하세요.
{"results":[{"n":1,"status":"confirmed|false|not_covered","ref":1,"evidence":"기준 자료 원문 그대로","explanation":"100자 이내"}]}`;

export async function checkAgainstReferences(claims, refs, { ledger = null, call = callClaudeJson } = {}) {
  if (!refs?.length || !claims.length) return claims;
  const refBlock = refs.map((r, i) => `[${i + 1}] ${r.title}\n${r.text}`).join("\n\n");
  const list = claims.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
  const parsed = await call({
    system: REFERENCE_PROMPT,
    user: `기준 자료:\n${refBlock}\n\n판단할 주장:\n${list}`,
    maxTokens: 3000,
    ledger,
    label: "reference",
    // 판정이 정해지는 자리다(법제처 대조와 같은 무게). 싼 모델로 내리지 않는다.
    strong: true,
  });
  const byN = new Map((Array.isArray(parsed?.results) ? parsed.results : []).map((r) => [Number(r.n), r]));
  return claims.map((c, i) => {
    const r = byN.get(i + 1);
    if (!r || !["confirmed", "false"].includes(r.status)) return c;
    const ref = refs[Number(r.ref) - 1];
    const evidence = String(r.evidence || "").trim();
    // ① 근거 문장이 그 기준 자료에 실제로 있어야 판정으로 인정한다.
    const at = ref && evidence ? locateQuote(ref.text, evidence) : null;
    if (!at) return c;
    return {
      ...c,
      verdict: r.status,
      verified_via: "reference",
      explanation: String(r.explanation || "").slice(0, 400) || (r.status === "confirmed" ? "기준 자료와 일치합니다." : "기준 자료와 다릅니다."),
      sources: [{ title: `기준 자료: ${ref.title}`, quote: ref.text.slice(at.start, at.end) }],
      from_reference: true,
    };
  });
}

// 자사(organization)에 관한 주장인가. 이름이 주장에 그대로 들어 있을 때만 그렇다고 본다.
export function mentionsOrganization(text, organization) {
  if (!organization || organization.length < 2) return false;
  const squash = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  return squash(text).includes(squash(organization));
}
