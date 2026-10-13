// 정답 기준 재확인 — 채점 직전에, 문항을 만들 때 쓴 조문이 오늘도 유효한지 다시 본다.
//
// 문항은 만든 날의 원문으로 정답을 정한다. 그런데 채점은 며칠 뒤에 할 수 있고, 만든 날의 판단이 틀렸을
// 수도 있다. 2026-10-13 로무앤톡 2차 감사에서 실제로 나왔다 — 검토 초안 문항의 정답 기준이 근로기준법
// 제16조(계약기간 1년)였는데, 이 조문은 "2007년 6월 30일까지 유효"한 효력 상실 조문이었다. 그 기준으로
// 채점하면 효력 없는 조문을 따라 한 답이 "정확"으로, 맞게 답한 쪽이 "오류"로 찍힌다.
//
// 그래서 채점 전에 기준 조문을 현행 원문으로 다시 받아
//   · 효력을 잃었거나(…까지 유효함) 조문이 없어졌으면 → 기준 무효(채점하지 않음)
//   · 정답 값이 현행 원문에 더는 없으면 → 기준 무효(법이 바뀌었을 수 있다)
// 로 둔다. 무효인 문항은 오류로도 정확으로도 세지 않는다 — 기준이 흔들리는 문항으로 상대를 판정하지 않는다.
// 기준 조문이 없는 문항(가짜 조문·없는 법률·삭제 조문 확인 등)은 그대로 통과한다.
import { searchStatute, getStatuteArticle } from "../lawApi.js";
import { SCENARIOS, scenarioFromTexts } from "./trapBank.js";

const compact = (s) => String(s || "").replace(/\s+/g, "");

/** 문항의 정답 기준이 된 조문 목록 [{ law, no, branch, value }] (value: 그 조문에 있어야 할 정답 값). */
export function answerKeyRefs(probe) {
  const o = probe?.oracle || {};
  const refs = [];
  const split = (no) => {
    const [n, br] = String(no).split("의");
    return { no: Number(n), branch: br ? Number(br) : null };
  };
  if (Array.isArray(o.errors)) for (const e of o.errors) if (e.law && e.article) refs.push({ law: e.law, ...split(e.article), value: e.actual || null });
  if (o.lawName && o.article && !["deleted_current", "fabrication_bait", "fake_law"].includes(probe.type)) {
    refs.push({ law: o.lawName, ...split(o.article), value: o.actualValue || null });
  }
  return refs;
}

/**
 * 반환: { valid: true } 또는 { valid: false, reason }
 * 법제처 조회가 실패하면(네트워크) 판단을 보류하고 valid로 둔다 — 조회 실패로 문항을 버리지 않는다.
 */
export async function checkAnswerKey(probe, { lookup = defaultLookup } = {}) {
  // 상황극 시나리오는 시나리오의 원문 확인(verify)을 그대로 다시 돌린다.
  if (probe?.type === "buried_premise" && probe.oracle?.scenario) {
    const sc = SCENARIOS.find((s) => s.id === probe.oracle.scenario);
    if (!sc) return { valid: true };
    const texts = [];
    for (const { law, no } of sc.src) {
      const a = await lookup(law, no);
      if (a === undefined) return { valid: true }; // 조회 실패 — 보류
      texts.push(a?.text || null);
    }
    if (texts.some((t) => t && t.includes("[효력 상실]"))) return { valid: false, reason: "정답 기준 조문이 효력을 잃은 조문입니다(…까지 유효함)." };
    return scenarioFromTexts(sc, texts, Date.now()) ? { valid: true } : { valid: false, reason: "정답 기준 조문의 현행 원문이 출제 당시 기준과 달라졌습니다." };
  }
  for (const r of answerKeyRefs(probe)) {
    const a = await lookup(r.law, r.branch ? `${r.no}의${r.branch}` : r.no);
    if (a === undefined) continue; // 조회 실패 — 보류
    const where = `${r.law} 제${r.no}조${r.branch ? `의${r.branch}` : ""}`;
    if (!a || !a.text) return { valid: false, reason: `정답 기준인 ${where}를 현행 법령에서 찾을 수 없습니다.` };
    if (a.expired || a.text.includes("[효력 상실]")) return { valid: false, reason: `정답 기준인 ${where}는 효력을 잃은 조문입니다(…까지 유효함).` };
    if (r.value && !compact(a.text).includes(compact(r.value))) return { valid: false, reason: `정답 값(${r.value})이 ${where} 현행 원문에 없습니다 — 법이 바뀌었을 수 있습니다.` };
  }
  return { valid: true };
}

// 조문 하나 — 찾으면 {text, expired}, 없으면 null, 조회 자체가 실패하면 undefined.
const cache = new Map();
async function defaultLookup(law, no) {
  const key = `${law}/${no}`;
  if (cache.has(key)) return cache.get(key);
  let out;
  try {
    const s = await searchStatute(law);
    if (!s.ok) out = undefined;
    else if (!s.found || !s.mst) out = null;
    else {
      const [n, br] = String(no).split("의");
      const a = await getStatuteArticle(s.mst, Number(n), br ? Number(br) : null);
      out = !a.ok ? undefined : a.found ? { text: a.text, expired: !!a.expired } : null;
    }
  } catch {
    out = undefined;
  }
  if (out !== undefined) cache.set(key, out);
  setTimeout(() => cache.delete(key), 10 * 60 * 1000).unref?.();
  return out;
}
