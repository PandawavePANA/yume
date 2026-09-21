// 문맥 복구 — 길어진 대화에서 AI가 앞부분을 잃고 틀린 말을 하기 시작할 때,
// 다시 붙여넣을 수 있는 "문맥 요약 프롬프트"를 만들어 준다.
//
// 왜 유메에 있어야 하는 기능인가: AI가 없는 사실을 지어내는 경로는 크게 둘이다.
// 애초에 모르는 것을 아는 척하거나, 알던 것을 잊고 지어내거나. 유메의 검증은
// 앞의 것을 잡는다. 이건 뒤의 것을 잡는다 — 대화가 길어지면 앞서 정한 결정과
// 제약이 창 밖으로 밀려나고, 그 빈자리를 모델이 그럴듯한 추측으로 메운다.
// 사용자 눈에는 "갑자기 거짓말을 시작한" 것으로 보인다.
//
// 출력은 판정이 아니라 **붙여넣을 글**이다. 그래서 검증 파이프라인과 달리
// 출처도 점수도 없다. 대신 지켜야 하는 것이 하나 있다: 대화에 없는 내용을
// 지어내 넣지 않는 것. 문맥을 바로잡겠다며 없던 사실을 새로 심으면 그건
// 고치는 게 아니라 오염이다.
import { callClaudeJson } from "./claude.js";

export const MAX_TRANSCRIPT_CHARS = 60000;
export const MIN_TRANSCRIPT_CHARS = 200;

const SYSTEM = `당신은 긴 AI 대화에서 흐트러진 문맥을 복구하는 도구입니다.

사용자가 AI와 나눈 대화 기록을 줍니다. 대화가 길어지면 AI는 앞부분을 잊고,
이미 정해진 결정과 제약을 어기거나 없는 사실을 지어냅니다. 당신이 할 일은
그 대화를 다시 시작할 때 **맨 앞에 붙여넣을 문맥 요약 프롬프트**를 쓰는 것입니다.

절대 규칙:
- 대화에 실제로 나온 내용만 씁니다. 빠진 부분을 그럴듯하게 메우지 마세요.
  없는 사실을 넣으면 문맥을 고치는 것이 아니라 오염시키는 것입니다.
- 사용자가 정한 것과 AI가 제안한 것을 구분하세요. 사용자가 승인하지 않은
  AI의 제안을 "정해진 것"으로 올리지 마세요.
- 확실하지 않으면 확실하지 않다고 적거나 빼세요.
- 사람 이름, 연락처, 주민등록번호, 카드번호 같은 식별정보는 프롬프트에
  옮기지 마세요. 역할로 바꿔 쓰세요(예: "의뢰인", "담당자").

JSON 하나만 출력하세요. 설명이나 코드블록 없이:
{
  "prompt": "붙여넣을 문맥 요약 프롬프트 전문. 한국어. 제목·구분선 없이 바로 읽히는 글.",
  "goal": "이 대화의 목적 한 문장",
  "decided": ["확정된 결정이나 사실", "..."],
  "constraints": ["지켜야 하는 제약이나 금지사항", "..."],
  "open": ["아직 정해지지 않았거나 답을 기다리는 것", "..."],
  "drift": [
    { "what": "AI가 앞 내용과 어긋나게 말한 지점", "where": "대략 어디쯤인지", "correct": "실제로 정해졌던 내용" }
  ],
  "note": "사용자에게 한 줄 안내. 특별히 주의할 것이 있으면 여기에."
}

drift는 실제로 어긋난 곳이 있을 때만 채웁니다. 없으면 빈 배열로 두세요 —
없는 실수를 찾아내려 하면 그것 자체가 지어내기입니다.
각 배열은 최대 8개. prompt는 2000자를 넘기지 마세요.`;

const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v, n, each) =>
  Array.isArray(v) ? v.map((x) => clip(x, each)).filter(Boolean).slice(0, n) : [];

export async function repairContext(transcript, { ledger = null } = {}) {
  const text = String(transcript || "").trim();
  if (text.length < MIN_TRANSCRIPT_CHARS) {
    const e = new Error("대화 내용이 너무 짧아요. 문맥을 복구하려면 주고받은 내용이 더 필요합니다.");
    e.code = "TOO_SHORT";
    throw e;
  }

  const raw = await callClaudeJson({
    system: SYSTEM,
    user: `다음은 사용자와 AI가 나눈 대화 기록입니다.\n\n<대화>\n${text.slice(0, MAX_TRANSCRIPT_CHARS)}\n</대화>`,
    maxTokens: 2600,
    label: "context-repair",
    ledger,
    // 무엇이 정해졌고 무엇이 제안에 그쳤는지 가르는 판단이다. 여기서 틀리면
    // 승인하지도 않은 것이 "확정"으로 굳어 다음 대화 내내 따라다닌다.
    strong: true,
  });

  const drift = Array.isArray(raw?.drift)
    ? raw.drift
        .map((d) => ({
          what: clip(d?.what, 300),
          where: clip(d?.where, 120),
          correct: clip(d?.correct, 300),
        }))
        .filter((d) => d.what)
        .slice(0, 8)
    : [];

  return {
    prompt: clip(raw?.prompt, 4000),
    goal: clip(raw?.goal, 300),
    decided: list(raw?.decided, 8, 300),
    constraints: list(raw?.constraints, 8, 300),
    open: list(raw?.open, 8, 300),
    drift,
    note: clip(raw?.note, 300),
  };
}
