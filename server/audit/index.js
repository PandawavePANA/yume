// 할루시네이션 감사 오케스트레이션.
//
// 흐름은 두 단계다. 자격 증명을 받지 않기 위해서다 — 무료 진단을 받으려고 사내 AI의
// API 키를 넘기는 기업은 없고, 그걸 요구하는 순간 리드 생성 도구로서는 죽는다.
//   1) 문항 발급: 유메가 오라클로 검증한 질문 묶음을 준다. 기업은 자기 AI에 그대로 넣는다.
//   2) 답변 채점: 받은 답변을 붙여넣으면 유메가 채점하고 지수를 낸다.
import { buildProbeSet, PROBE_TYPES } from "./probeBank.js";
import { gradeAnswer } from "./grade.js";
import { scoreAudit, buildRecommendation } from "./score.js";
import { explainResult } from "./explain.js";

export { buildProbeSet, PROBE_TYPES, explainResult };

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
    recommendation: buildRecommendation(score),
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
