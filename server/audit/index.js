// 할루시네이션 감사 오케스트레이션.
//
// 흐름은 두 단계다. 자격 증명을 받지 않기 위해서다 — 무료 진단을 받으려고 사내 AI의
// API 키를 넘기는 기업은 없고, 그걸 요구하는 순간 리드 생성 도구로서는 죽는다.
//   1) 문항 발급: 유메가 오라클로 검증한 질문 묶음을 준다. 기업은 자기 AI에 그대로 넣는다.
//   2) 답변 채점: 받은 답변을 붙여넣으면 유메가 채점하고 지수를 낸다.
import { buildProbeSet, PROBE_TYPES as BASE_PROBE_TYPES, AUDIT_DOMAINS } from "./probeBank.js";
import { buildAttackSet, focusFromResults, ATTACK_TYPES, ATTACK_FAMILIES } from "./attackBank.js";
import { gradeAnswer } from "./grade.js";
import { scoreAudit, buildRecommendation } from "./score.js";
import { explainResult } from "./explain.js";
import { copyInstructions, cutAtStarts, splitByMarkers, splitNumbered } from "./splitAnswers.js";
import { callClaudeJson } from "../claude.js";

// 1차 문항과 공격형 문항의 유형 이름을 한곳에서 — 화면·보고서·점수가 같은 이름을 쓴다.
const PROBE_TYPES = { ...BASE_PROBE_TYPES, ...ATTACK_TYPES };
export { buildProbeSet, buildAttackSet, focusFromResults, ATTACK_FAMILIES, PROBE_TYPES, AUDIT_DOMAINS, explainResult, copyInstructions };

const MAX_PASTE_CHARS = 60_000;

// 붙여넣은 답변 한 덩어리를 문항별로 나눈다(splitAnswers.js의 순서대로).
// 반환: { answers: { [probeId]: 답변 }, matched, method }
export async function splitAnswerText(raw, probes, { call = callClaudeJson } = {}) {
  const text = String(raw || "").slice(0, MAX_PASTE_CHARS);
  const n = probes.length;
  const toAnswers = (r, method) => {
    const answers = {};
    for (const [k, v] of Object.entries(r?.parts || {})) if (probes[Number(k) - 1]) answers[probes[Number(k) - 1].id] = v;
    return { answers, matched: Object.keys(answers).length, method };
  };
  const enough = (r) => r && r.matched >= Math.ceil(n / 2);

  const marked = splitByMarkers(text, n);
  if (enough(marked)) return toAnswers(marked, "markers");

  // 번호 표시가 없다 — 각 답변이 시작하는 원문 조각만 모델에게 묻는다(답을 옮겨 쓰게 하지 않는다).
  try {
    const list = probes.map((p, i) => `${i + 1}. ${p.question}`).join("\n");
    const r = await call({
      system:
        "아래 '답변 전체'는 번호 붙은 질문들에 차례로 답한 글입니다. 각 질문에 대한 답이 **시작되는 부분**을 답변 전체에서 " +
        "한 글자도 바꾸지 말고 그대로 20~40자 옮기세요. 그 질문에 대한 답이 없으면 빈 문자열로 두세요. 답 내용을 요약하지 마세요.\n" +
        '반드시 JSON으로만: {"starts":{"1":"원문 그대로","2":"..."}}',
      user: `질문:\n${list}\n\n답변 전체:\n${text}`,
      maxTokens: 1500,
      label: "audit:split",
    });
    const cut = cutAtStarts(text, r?.starts || {}, n);
    if (cut && cut.matched >= 1) return toAnswers(cut, "located");
  } catch {
    // 나누기 보조가 실패해도 번호 방식으로 한 번 더 시도한다.
  }
  const numbered = splitNumbered(text, n);
  if (numbered) return toAnswers(numbered, "numbered");
  if (marked) return toAnswers(marked, "markers");
  // 질문이 하나뿐이면 전체가 그 답이다.
  if (n === 1 && text.trim()) return { answers: { [probes[0].id]: text.trim() }, matched: 1, method: "single" };
  return { answers: {}, matched: 0, method: "none" };
}

const MAX_ANSWER_CHARS = 8000;
const CONCURRENCY = 3;

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// probes: 발급 때 준 문항 배열(정답 포함), answers: { [probeId]: "AI 답변" }
export async function runAudit({ probes, answers, subject = "", onProgress = () => {} }) {
  const targets = probes.filter((p) => String(answers?.[p.id] || "").trim());
  if (targets.length === 0) {
    return { error: "채점할 답변이 없습니다. 문항에 대한 AI 답변을 하나 이상 넣어주세요." };
  }

  onProgress(`답변 ${targets.length}개를 채점하는 중…`);
  const results = await inBatches(targets, CONCURRENCY, async (p) => {
    const answer = String(answers[p.id]).slice(0, MAX_ANSWER_CHARS);
    const g = await gradeAnswer(p, answer);
    const r = {
      probeId: p.id,
      type: p.type,
      typeLabel: PROBE_TYPES[p.type]?.label || p.type,
      domain: p.domain,
      question: p.question,
      weight: p.weight ?? 1,
      groundTruth: p.groundTruth,
      expected: p.expected,
      oracle: p.oracle,
      answerExcerpt: answer.slice(0, 400),
      ...g,
    };
    return { ...r, explain: explainResult(r) };
  });

  const score = scoreAudit(results);
  return {
    subject: String(subject || "").slice(0, 120),
    score,
    recommendation: buildRecommendation(score, PROBE_TYPES),
    results,
    method: {
      summary:
        "문항은 유메가 법제처 국가법령정보와 학술 레지스트리로 실재 여부를 확인해 만든 것입니다. " +
        "존재하지 않는 조문·판례·DOI를 묻는 문항은 '없다'가 정답으로 확정된 상태에서 출제되며, " +
        "출처를 요구한 문항은 답변에 달린 인용을 유메가 다시 공식 데이터베이스에 조회해 채점합니다.",
      types: PROBE_TYPES,
    },
    createdAt: new Date().toISOString(),
  };
}
