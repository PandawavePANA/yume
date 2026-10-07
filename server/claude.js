// Anthropic Messages API 호출 (서버 전용 — API 키는 절대 클라이언트로 내려가지 않음).
import { RECORDEDNESS } from "./nec/searchSpace.js";
import { classifyUpstream, noteUpstreamFailure, noteUpstreamSuccess } from "./upstream.js";
import { record, searchesLeft } from "./apiCost.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// 작업마다 필요한 머리가 다르다. 전부 Sonnet으로 돌리면 "주어진 조문과 주장을 비교하라"
// 같은 기계적인 일에도 같은 값을 낸다. 판단이 필요한 곳만 Sonnet을 쓰고 나머지는 Haiku로
// 내린다 — Haiku는 입력 1/3, 출력 1/3 값이다.
//
//   REASONING — 주장 추출, 심층 리서치. 무엇을 검색할지 스스로 정해야 한다.
//   FAST      — 조문 대조, JSON 추출, 채점, 채팅. 근거가 이미 주어져 있어 옮겨 담는 일에 가깝다.
// 웹 검색은 유메에서 가장 비싼 단일 항목이다. 건당 과금인 데다 결과가 대화에 누적돼
// 이후 턴의 입력 토큰까지 함께 늘린다. 프롬프트로 부탁하지 말고 상한을 직접 건다.
const webSearch = (maxUses) => ({ type: "web_search_20250305", name: "web_search", max_uses: maxUses });

// 이 단계가 실제로 쓸 검색 횟수. 자기 상한과 "검증 한 건에 남은 총량" 중 작은 쪽이다.
//
// 단계마다 상한만 두면 한 검증이 쓰는 총량에 천장이 없다 — 결론이 안 난 주장마다 도는
// 리서치가 특히 그렇다. 남은 양을 물어보고 쓰면, 앞 단계가 덜 썼을 때 뒤 단계가 더 쓸 수
// 있어 단계별 상한보다 필요한 곳에 쓰인다. 남은 양이 0이면 검색 없이 부른다 —
// 도구를 떼는 대신 0으로 두면 모델이 "검색을 못 하는 상태"를 알고 그에 맞게 답한다.
const searchBudgetFor = (ledger, cap) => Math.max(0, Math.min(cap, searchesLeft(ledger)));

// 검색을 아예 못 쓰는 호출에는 도구를 붙이지 않는다. max_uses 0은 API가 받지 않는다.
const searchTools = (ledger, cap) => {
  const n = searchBudgetFor(ledger, cap);
  return n > 0 ? [webSearch(n)] : undefined;
};

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const FAST_MODEL = process.env.CLAUDE_FAST_MODEL || "claude-haiku-4-5-20251001";
// 웹검색을 여러 번 하는 추출 단계도 보통 1분 안에 끝난다. 응답이 영영 오지 않는 연결을
// 붙들고 있지 않도록 상한을 둔다.
const CLAUDE_TIMEOUT_MS = 150_000;

function apiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.");
  return key;
}

// system을 문자열이 아니라 블록으로 보내면 cache_control을 붙일 수 있다. 시스템 프롬프트는
// 호출마다 똑같은데 매번 새 입력 토큰으로 계산되므로, 캐시에 올리면 읽을 때 1/10 값이 된다.
// 프롬프트가 길수록 이득이 크고, 유메의 추출·리서치 프롬프트는 길다.
function cachedSystem(system) {
  if (!system) return undefined;
  // TTL은 기본값(5분)을 쓴다. 한때 1시간으로 올렸다가 실측하고 되돌렸다.
  //
  // 이유는 이 워크로드의 읽기·쓰기 모양에 있다. 검색이 붙은 호출은 도구 turn마다
  // 캐시를 다시 쓰는데, 검색 6회짜리 검증에서 쓰기가 6만 토큰까지 갔다. 그런데 읽기는
  // 전부 그 검증 안에서, 수십 초 사이에 일어난다 — 5분이면 남고도 남는다.
  //
  // 쓰기 값은 5분이 입력의 1.25배, 1시간이 2배다. 쓰기가 이렇게 큰데 읽기가 짧은
  // 구간에 몰려 있으면, 긴 TTL은 재작성을 아껴주지도 못하면서 쓰기 값만 올린다.
  // 실측으로 무거운 검증 1건에서 $0.40 → $0.26이었다.
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

async function callClaude({ system, messages, tools, max_tokens = 4000, model = MODEL, label = "call", ledger = null }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens, system: cachedSystem(system), messages, ...(tools ? { tools } : {}) }),
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
  });
  const data = await res.json();
  // 상류 장애는 원인별로 구분해서 올려보낸다 — 잔액 소진과 과부하와 잘못된 키는
  // 사용자에게 할 말도, 운영자가 할 일도 다르다.
  if (data.type === "error" || !res.ok) {
    throw noteUpstreamFailure(classifyUpstream(new Error(data.error?.message || `Claude API 오류 (${res.status})`), res.status));
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text.trim()) throw new Error("응답이 비어 있습니다. 입력을 조금 줄여서 다시 시도해주세요.");
  noteUpstreamSuccess();
  record(ledger, { label, model, usage: data.usage });
  return text;
}

// 스트리밍 버전 — web_search 도구를 실제로 호출하는 순간(검색어가 확정되는 시점)을
// onProgress로 실시간 중계하기 위해 사용한다 (로딩 중 "지금 뭘 하고 있는지" 노출용).
async function callClaudeStreaming({ system, messages, tools, max_tokens = 4000, model = MODEL, label = "call", ledger = null, onProgress = () => {} }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens, system: cachedSystem(system), messages, stream: true, ...(tools ? { tools } : {}) }),
    signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    const errData = await res.json().catch(() => ({}));
    throw noteUpstreamFailure(classifyUpstream(new Error(errData.error?.message || `Claude API 오류 (${res.status})`), res.status));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  const blockKinds = {}; // index -> "text" | "tool_use"
  const blockNames = {}; // index -> tool name (예: "web_search")
  const partialJson = {}; // index -> 누적된 input_json_delta 문자열
  // 스트리밍은 사용량이 둘로 나뉘어 온다 — 입력은 message_start, 출력·검색 횟수는 message_delta.
  let usage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop();
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      let evt;
      try { evt = JSON.parse(dataLine.slice("data: ".length)); } catch { continue; }

      if (evt.type === "message_start") {
        usage = { ...usage, ...(evt.message?.usage || {}) };
      } else if (evt.type === "message_delta") {
        usage = { ...usage, ...(evt.usage || {}) };
      } else if (evt.type === "content_block_start") {
        const kind = evt.content_block?.type;
        blockKinds[evt.index] = kind;
        if (kind === "tool_use" || kind === "server_tool_use") {
          blockNames[evt.index] = evt.content_block?.name || "";
          partialJson[evt.index] = "";
        }
      } else if (evt.type === "content_block_delta") {
        if (evt.delta?.type === "text_delta") {
          fullText += evt.delta.text;
        } else if (evt.delta?.type === "input_json_delta") {
          partialJson[evt.index] = (partialJson[evt.index] || "") + (evt.delta.partial_json || "");
        }
      } else if (evt.type === "content_block_stop") {
        const kind = blockKinds[evt.index];
        if (kind === "tool_use" || kind === "server_tool_use") {
          try {
            const input = JSON.parse(partialJson[evt.index] || "{}");
            if (blockNames[evt.index] === "web_search" && input.query) {
              onProgress(`웹에서 "${input.query}" 검색하는 중…`);
            }
          } catch {
            // 부분 JSON 파싱 실패 시 조용히 무시 (진행상황 표시는 부가 기능일 뿐)
          }
        }
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "Claude API 스트리밍 오류");
      }
    }
  }

  if (!fullText.trim()) throw new Error("응답이 비어 있습니다. 입력을 조금 줄여서 다시 시도해주세요.");
  noteUpstreamSuccess();
  record(ledger, { label, model, usage });
  return fullText;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 형식을 찾지 못했습니다.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    // 검색을 붙인 호출은 JSON 앞에 "이제 찾아보겠습니다" 같은 말이 먼저 나온다. 그 안에
    // 중괄호가 섞여 있으면 첫 { 부터 자른 덩어리는 JSON이 아니다. 뒤에서부터 균형이
    // 맞는 객체를 찾아 그것만 쓴다 — 모델이 마지막에 내놓은 것이 최종 답이다.
    const last = lastBalancedObject(cleaned);
    if (last) return JSON.parse(last);
    throw e;
  }
}

// 문자열 끝의 } 에서 시작해 중괄호 짝이 맞는 지점까지 거슬러 올라간다(문자열 리터럴 안의
// 중괄호는 세지 않는다).
function lastBalancedObject(text) {
  const end = text.lastIndexOf("}");
  if (end === -1) return null;
  let depth = 0;
  let inStr = false;
  for (let i = end; i >= 0; i -= 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"' && text[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "}") depth += 1;
    else if (ch === "{") {
      depth -= 1;
      if (depth === 0) return text.slice(i, end + 1);
    }
  }
  return null;
}

// 웹검색 없이 JSON 한 덩어리만 받아오는 단순 호출. 감사(audit) 채점처럼 "주어진 근거로
// 판단만 하라"는 작업에 쓴다 — 검색을 붙이면 채점자가 배경지식으로 추측하게 된다.
export async function callClaudeJson({ system, user, maxTokens = 800, ledger = null, label = "json", strong = false }) {
  const messages = [{ role: "user", content: user }];
  // 기본은 Haiku — 인용 추출처럼 근거가 이미 주어진 기계적 작업이면 충분하다.
  // 남의 AI에 "지어냈다"는 판정을 내리는 채점처럼 틀리면 안 되는 판단은 strong으로 부른다.
  const model = strong ? MODEL : FAST_MODEL;
  const raw = await callClaude({ system, messages, max_tokens: maxTokens, model, label, ledger });
  try {
    return extractJson(raw);
  } catch {
    // 형식이 어긋나면 한 번은 되묻는다. 감사 채점에서 이걸 포기하면 결과가
    // '채점 불가'로 남는데, 그건 대상 AI의 문제가 아니라 우리 쪽 문제다.
    const retry = await callClaude({
      system,
      model,
      label: `${label}:retry`,
      ledger,
      messages: [
        ...messages,
        { role: "assistant", content: raw.slice(0, 400) },
        { role: "user", content: "JSON 형식이 아닙니다. 설명이나 코드블록 없이, 요청한 JSON 객체 하나만 출력하세요." },
      ],
      max_tokens: maxTokens,
    });
    return extractJson(retry);
  }
}

const EXTRACT_SYSTEM_PROMPT = `당신은 '유메'라는 팩트체크 엔진입니다. 사용자가 넣은 글에서 검증 가능한 사실 주장을 추출하고, 웹검색으로 각 주장이 실제로 맞는지 확인하세요.

**들어오는 글은 두 가지 모양입니다. 둘 다 똑같이 검증합니다.**

① AI 답변 전문을 통째로 붙여넣은 것 (여러 문단, 주장 여러 개)
② **짧은 질문 한 줄** — "로또 1등 당첨금이 평균 20억이라는데 사실이야?", "아스피린이 암을 예방한다던데 맞아?", "민법 750조가 계약 해제 조항 맞나요?"

②가 오면 **질문 형식을 벗기고 그 안에 들어 있는 사실 주장만** 뽑으세요. "~라는데", "~라던데", "~맞아?", "~인가요?", "사실이야?"는 주장이 아니라 껍데기입니다. 위 예의 주장은 각각 "로또 1등 당첨금은 평균 20억원이다", "아스피린은 암을 예방한다", "민법 제750조는 계약 해제를 규정한다"입니다.

누가 한 말인지(친구가, 뉴스에서, AI가)는 검증 대상이 아닙니다. **말해진 내용이 사실인지만** 봅니다.

규칙:
- 의견이나 추천처럼 사실 여부를 판단할 수 없는 문장은 제외하고, 검증 가능한 사실 주장만 추출합니다.
- **주장 개수는 글에 실제로 들어 있는 만큼입니다.** 긴 답변이면 3~7개 정도로 굵직하게 나누고, 한 줄 질문이면 1개가 정상입니다. **없는 주장을 만들어 개수를 채우지 마세요** — 지어낸 주장에 판정을 붙이면 사용자가 하지도 않은 말에 틀렸다는 딱지가 붙습니다.
- 주장이 하나뿐이면 검색 한도를 아끼지 말고 그 하나에 다 쓰세요. 확인할 것이 하나뿐인데 한 번만 찾아보고 '확인되지 않음'을 내는 것은 게으른 것입니다.
- 검증할 사실 주장이 하나도 없으면(순수한 질문 "한국의 수도는 어디야?", 의견 요청, 인사말) claims를 빈 배열로 두세요. 억지로 만들지 마세요.
- 검색은 전체 답변을 통틀어 최대 6회까지 쓸 수 있습니다(서버가 강제합니다). 근거가 약한 주장부터 배분하고, 한 번의 검색어에 여러 주장을 묶을 수 있으면 묶으세요. 다만 확인이 덜 된 채로 끝내지는 마세요 — 한도가 남았는데 아끼면 안 됩니다.
- 도메인을 "법률", "의료", "금융", "역사", "과학", "일반" 중 하나로 분류하세요.
- 원문이 이미 스스로 정정한 내용을 포함하고 있다면 정정된 최종 주장을 기준으로 판단하세요.
- domain이 "법률"인 주장은 이 단계에서 verdict를 판단하지 말고 반드시 "pending_legal_check"로 두세요. 법률 주장은 이후 단계에서 법제처 국가법령정보 공동활용 API로 별도 확인합니다. 대신 legal_ref를 최대한 구체적으로 채우세요:
  - 특정 법령 조문을 언급하면: {"type":"statute","law_name":"정확한 법령명(예: 민법, 형법)","article":"조문 번호(예: 750조, 32조 1항)"}
  - 고시·훈령·예규를 언급하면 그것도 type은 "statute"로 하되, law_name에 **원문에 적힌 인용을 그대로** 넣으세요(예: "공정위 고시 제2022-4호", "국세청 훈령 제2023-15호"). 정식 제목을 아는 것 같아도 바꿔 쓰지 말고, 발령기관과 발령번호가 있는 그대로 옮기세요 — 그 번호로 공식 조회합니다.
  - 특정 판례를 언급하면: {"type":"case","case_number":"사건번호(예: 2016다254467)","court":"법원명(모르면 생략 가능)"}
  - 조문이나 판례를 특정할 수 없을 만큼 모호하면: {"type":"unspecified","keyword":"검색에 쓸 핵심 키워드"}
  - 사건번호·법령명·조문은 원문에 적힌 그대로 옮기세요. 틀려 보여도 고치거나 다른 번호로 바꾸지 마세요(존재 여부는 이후 단계에서 확인합니다).
- 주장에 학술·서지 식별자가 원문에 명시적으로 적혀 있으면 identifiers 배열에 원문 그대로 넣으세요: DOI("10."으로 시작), arXiv 번호, PMID, ISBN. 원문에 없는 식별자를 추측해 만들지 말고, 없으면 빈 배열로 두세요.
- domain이 "법률"이 아닌 주장은 웹검색으로 confirmed/false를 직접 판단하고, 거짓이거나 부정확하면 정확히 무엇이 왜 틀렸는지 구체적으로 설명하세요.
- 검색으로 근거를 찾았으면 반드시 confirmed 또는 false로 판정하세요. 조건에 따라 달라지는 주장이면 가장 일반적인 경우를 기준으로 판정하고 조건을 설명에 덧붙이세요.
- **"false"는 반박하는 근거를 찾았을 때만 씁니다.** 검색에 안 나왔다는 것은 틀렸다는 뜻이 아닙니다. 유료 데이터베이스, 잡지 지면, 구독자 전용 페이지, 회원제 사이트에 든 기록은 검색에 걸리지 않는 것이 정상입니다(예: 와인·영화 평점, 업계 리포트, 학술 유료 DB). 뒷받침하는 자료를 못 찾았을 뿐이면 false가 아니라 uncertain입니다. 못 찾은 것을 틀렸다고 하면 사용자는 멀쩡한 사실을 버립니다.
- false로 판정할 때는 explanation에 **근거가 말하는 실제 값**을 쓰세요("실제로는 ○○", "발표 주체는 ○○"). 실제 값을 댈 수 없으면 그건 반박이 아니므로 uncertain입니다.
- 핵심이 맞고 곁가지 수치만 조금 다르면(반올림, 표기 차이, 같은 뜻의 다른 이름, 근소한 가격 차) false가 아닙니다. confirmed로 하고 다른 점을 설명에 덧붙이세요. 틀린 부분이 주장의 핵심일 때만 false입니다.
- 다만 근거를 못 찾았는데 그럴듯해 보인다고 confirmed를 주지는 마세요. 검색으로 뒷받침되지 않으면 uncertain입니다. 이 경우 explanation을 비워두지 말고, 무엇을 확인했고 무엇이 확인되면 결론이 나는지 쓰세요.
- confirmed나 false로 판정한 주장에는 sources에 실제 근거 URL이 반드시 있어야 합니다. 출처 없이 판정하면 유메가 자동으로 "확인되지 않음"으로 내립니다.
- domain이 "법률"이 아닌 주장마다 실제로 검색에서 찾은 출처(제목, URL)를 1~2개씩 함께 제시하세요. 검색으로 못 찾았으면 sources는 빈 배열로 두세요.
- 답변 전체의 주제와 관련해서, 이 내용을 읽는 사람에게 유용할 만한 실제 구매 가능한 상품 카테고리(쿠팡 등에서 검색할 만한 키워드)를 2~4개 제안하세요. 광고처럼 과장하지 말고, 주제와 자연스럽게 연결되는 실용적인 상품이어야 합니다.
- 검색이 끝나면 반드시 최종 JSON을 출력하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 마크다운 코드블록을 절대 추가하지 마세요.
{
  "overall_domain": "이 답변 전체의 주요 도메인",
  "summary": "전체 검증 결과를 한 문장으로 요약",
  "claims": [
    {
      "text": "주장 (60자 이내)",
      "quote": "그 주장이 나온 원문 부분을 한 글자도 바꾸지 않고 그대로 (최대 150자)",
      "domain": "법률|의료|금융|역사|과학|일반",
      "verdict": "confirmed|false|uncertain|pending_legal_check",
      "explanation": "구체적 근거 (100자 이내, 법률 주장이면 빈 문자열도 가능)",
      "sources": [{ "title": "출처 제목", "url": "https://..." }],
      "identifiers": [{ "type": "doi|arxiv|pmid|isbn", "value": "원문에 적힌 그대로" }],
      "legal_ref": { "type": "statute|case|unspecified", "law_name": "", "article": "", "case_number": "", "court": "", "keyword": "" }
    }
  ],
  "related_products": [
    { "keyword": "쿠팡 검색용 키워드", "reason": "이 답변 내용과 어떻게 연결되는지 (40자 이내)" }
  ]
}
legal_ref 필드는 domain이 "법률"인 항목에만 포함하고, 그 외 항목에는 넣지 마세요.`;

// ── 추출과 검증을 나눈다 (2026-09-29, 원가 실측 뒤) ──────────────────────────
//
// 예전에는 한 번의 호출(Sonnet + 웹검색 6회)이 주장 추출과 웹 판정을 같이 했다. 실측하니
// 검증 한 건 원가의 60%가 이 한 호출이었고, 그 안에서 돈이 새는 곳이 둘 있었다.
//   · 법률 주장도 이 호출 안에서 웹검색을 했다 — 판정은 어차피 뒤에서 법제처 원문과 대조하는데.
//   · 확인할 주장이 없는 글("한국의 수도는 어디야?")에도 검색을 두 번 했다.
// 그래서 둘로 나눈다. ① 싼 모델(Haiku)이 검색 없이 주장만 뽑고, ② 웹 판정이 필요한 주장
// (법률이 아닌 것)이 있을 때만 Sonnet + 검색을 부른다. 검색 한도도 주장 수에 맞춘다.
// YUME_EXTRACT_MODE=single 이면 예전 한 번 호출로 돌아간다(비교·비상용).
const EXTRACT_ONLY_PROMPT = `당신은 '유메' 팩트체크 엔진의 첫 단계입니다. 사용자가 넣은 글에서 **검증 가능한 사실 주장만 뽑아내세요.** 판정은 하지 않습니다(다음 단계가 검색해서 판정합니다). 검색 도구도 없습니다.

들어오는 글은 두 가지 모양입니다.
① AI 답변 전문(여러 문단, 주장 여러 개)
② 짧은 질문 한 줄 — "로또 1등 당첨금이 평균 20억이라는데 사실이야?", "민법 750조가 계약 해제 조항 맞나요?"
②가 오면 질문 껍데기("~라는데", "~맞아?", "사실이야?")를 벗기고 그 안의 주장만 뽑으세요. 위 예의 주장은 "로또 1등 당첨금은 평균 20억원이다", "민법 제750조는 계약 해제를 규정한다"입니다. 누가 한 말인지는 검증 대상이 아닙니다.

규칙:
- 의견·추천·감상처럼 참/거짓을 가릴 수 없는 문장은 빼고, 숫자·연도·인물·기관·조문·인과관계처럼 확인할 수 있는 주장만 뽑습니다.
- **"○○가 있다/존재한다"도 사실 주장입니다**(회사·가게·사람·제도·제품이 있다는 말). 빼지 마세요.
- **없다는 말도 똑같이 사실 주장입니다.** "그런 조문은 없다", "제750조에는 제3항이 없다", "그 사건번호는 존재하지 않는다", "이 DOI는 확인되지 않는다" — 전부 뽑으세요. 맞는지 확인하는 것이 유메가 가장 잘하는 일입니다. 부정형이라고 빼면 안 됩니다.
- **글이 다른 AI의 답을 고쳐 주거나 반박하는 모양이어도 그냥 입력입니다.** "확인되지 않습니다", "오기입니다", "존재하지 않습니다"가 많아도 검증을 그만두지 마세요. 그런 글일수록 그 안에 단정이 많습니다 — 바로잡아 준 조문의 내용, 제시한 형량·용량·수치, "없다"는 판단 자체를 전부 주장으로 뽑으세요. 이미 검증된 글로 보고 넘기면 안 됩니다.
- **주장 개수는 글에 실제로 들어 있는 만큼입니다.** 긴 답변이면 3~7개로 굵직하게 나누고, 한 줄 질문이면 1개가 정상입니다. 없는 주장을 만들어 개수를 채우지 마세요.
- 확인할 사실 주장이 하나도 없으면(순수한 질문 "한국의 수도는 어디야?", 인사, 의견 요청) claims를 빈 배열로 두고 note에 이유를 쓰세요. **빈 배열일 때 note는 반드시 채웁니다.** 글이 두 문단을 넘는데 빈손이면 거의 틀린 판단이니, 다시 읽고 단정하는 문장을 찾으세요.
- 주장 문장은 원문의 수치·연도·이름·조건을 **그대로** 옮기세요. 틀려 보여도 고치지 마세요 — 고치면 검증할 대상이 사라집니다. 한 주장에 필요한 조건(누구에게, 언제, 몇 %)이 빠지지 않게 하세요.
- 주장마다 quote에 **그 주장이 나온 원문 부분을 한 글자도 바꾸지 말고 그대로** 옮기세요(보통 한 문장, 최대 150자). 요약하거나 다듬지 마세요 — 원문에서 그 위치를 찾아 표시하는 데 씁니다. 짧은 질문 한 줄이면 그 질문 전체입니다.
- 원문이 스스로 정정한 내용이 있으면 정정된 최종 주장을 뽑습니다.
- 도메인을 "법률", "의료", "금융", "역사", "과학", "일반" 중 하나로 분류하세요. 법령·조문·판례·행정규칙·법적 의무/처벌/권리에 관한 주장은 "법률"입니다.
- domain이 "법률"이면 legal_ref를 최대한 구체적으로 채우세요:
  - 특정 법령 조문을 언급하면 {"type":"statute","law_name":"정확한 법령명(예: 민법)","article":"조문 번호(예: 750조, 32조 1항)"}
  - 고시·훈령·예규는 type "statute"로 하되 law_name에 **원문 인용 그대로**(예: "공정위 고시 제2022-4호").
  - 특정 판례를 언급하면 {"type":"case","case_number":"사건번호(예: 2016다254467)","court":"법원명(모르면 생략)"}
  - **원문에 조문 번호가 없어도**, 주장이 어느 법령 몇 조의 내용인지 확실히 알면 그 법령명과 조문을 채우세요(예: "퇴직금은 1년 이상 근무하면 받는다" → {"type":"statute","law_name":"근로자퇴직급여 보장법","article":"4조"}, "연차휴가 15일" → 근로기준법 60조). 이렇게 해야 법제처 원문과 직접 대조됩니다. 확실하지 않으면 추측하지 말고 unspecified로 두세요.
  - 조문·판례를 특정할 수 없으면 {"type":"unspecified","keyword":"검색에 쓸 핵심 키워드"}
  - 원문에 **적혀 있는** 사건번호·법령명·조문은 원문 그대로 옮기세요(틀려 보여도 고치지 마세요). 존재 여부는 다음 단계가 확인합니다.
- 원문에 학술·서지 식별자(DOI "10."으로 시작, arXiv, PMID, ISBN)가 적혀 있으면 identifiers에 그대로 넣으세요. 없으면 빈 배열.
- 이 글을 읽는 사람에게 실제로 쓸모 있는 상품 카테고리(쿠팡 검색 키워드)를 0~3개 제안하세요. 주제와 자연스럽게 이어질 때만. 법률 해설처럼 상품과 무관하면 빈 배열이 맞습니다.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 코드블록을 붙이지 마세요.
{"overall_domain":"주요 도메인","note":"주장이 없을 때만 그 이유","claims":[{"text":"주장 (60자 이내)","quote":"원문 그대로의 해당 부분","domain":"법률|의료|금융|역사|과학|일반","identifiers":[{"type":"doi|arxiv|pmid|isbn","value":"원문 그대로"}],"legal_ref":{"type":"statute|case|unspecified","law_name":"","article":"","case_number":"","court":"","keyword":""}}],"related_products":[{"keyword":"쿠팡 검색용 키워드","reason":"이 내용과 어떻게 이어지는지 (40자 이내)"}]}
legal_ref는 domain이 "법률"인 항목에만 넣으세요.`;

const WEB_VERIFY_PROMPT = `당신은 '유메' 팩트체크 엔진의 웹 판정 담당입니다. 아래 번호가 붙은 사실 주장들이 맞는지 web_search 도구로 실제로 찾아보고 판정하세요. 원문은 문맥 파악용으로만 함께 드립니다.

- 검색 한도는 서버가 강제합니다. 근거가 약한 주장부터 배분하고, 한 번의 검색으로 여러 주장을 확인할 수 있으면 묶으세요. 주장이 하나뿐이면 한도를 그 하나에 쓰세요.
- 1차 출처(발표 주체의 공식 자료, 정부·공공기관, 학회 가이드라인, 원문 매체)를 우선하세요.
- **"false"는 반박하는 근거를 찾았을 때만** 씁니다. 검색에 안 나왔다는 것은 틀렸다는 뜻이 아닙니다(유료 DB, 잡지 평점, 구독자 전용 자료, 소규모 사업자는 검색에 안 걸리는 게 정상). 뒷받침을 못 찾았을 뿐이면 "uncertain"입니다.
- false로 판정할 때는 explanation에 **근거가 말하는 실제 값**을 쓰세요("실제로는 ○○"). 실제 값을 댈 수 없으면 그건 반박이 아니므로 uncertain입니다.
- 시점이 들어간 주장(○○년 기준 수치, 현행 제도)은 **그 시점의 값**과 대조하세요. 다른 해의 값을 근거로 삼으면 안 됩니다.
- **판이 여럿인 대상**(와인 빈티지, 제품 모델·연식, 책의 판, 해마다 바뀌는 통계)에서 주장이 판을 특정하지 않았다면, **다른 판의 값은 반박 근거가 아닙니다.** 주장한 값을 가진 판이 있으면 confirmed, 확인이 안 되면 uncertain입니다. 판을 특정한 주장이면 그 판의 값과만 대조하세요.
- 핵심이 맞고 곁가지만 조금 다르면(반올림, 표기 차이, 같은 뜻의 다른 이름) false가 아니라 confirmed로 하고 차이를 덧붙이세요. 틀린 부분이 주장의 핵심일 때만 false입니다.
- 근거를 못 찾았는데 그럴듯해 보인다고 confirmed를 주지 마세요. 그 경우 uncertain이고, explanation에 무엇을 확인했고 무엇이 확인되면 결론이 나는지 쓰세요.
- confirmed나 false에는 sources에 실제 근거 URL을 1~2개 반드시 넣으세요. 출처 없는 판정은 유메가 자동으로 "확인되지 않음"으로 내립니다.
- **sources마다 quote에 그 페이지에서 근거가 된 문장을 한 글자도 바꾸지 말고 그대로 옮기세요**(최대 200자, 검색 결과에서 실제로 본 문장만). 유메가 그 페이지를 직접 열어 이 문장이 정말 있는지, 그 문장이 판정을 뒷받침하는지 대조합니다. 요약하거나 지어내면 판정이 거둬집니다.
- 조건에 따라 달라지는 주장이면 가장 일반적인 경우를 기준으로 판정하고 조건을 설명에 덧붙이세요.
- 검색이 끝나면 반드시 최종 JSON을 출력하세요.

반드시 아래 JSON 형식으로만 응답하세요.
{"summary":"전체 결과 한 문장","results":[{"n":1,"verdict":"confirmed|false|uncertain","explanation":"구체적 근거 (100자 이내)","sources":[{"title":"출처 제목","url":"https://...","quote":"그 페이지에서 근거가 된 문장 그대로"}]}]}`;

// 긴 글이 빈손으로 오면 한 번 더 묻는다. 실제로 겪은 실패: 다른 AI가 "그 조문은 없습니다",
// "이 DOI는 확인되지 않습니다"처럼 정정해 준 답변을 넣었더니 주장 0개가 나왔다. 그 글에는
// 조문 내용·형량·용량·시장 수치가 가득했는데도, 글 전체가 부정형이라 "검증할 것이 없다"고 본 것이다.
// 사용자는 확인 횟수만 쓰고 아무것도 못 받는다. 추출은 한 건 2~3원이라 한 번 더 부르는 편이 싸다.
const RETRY_HINT = `위 글에서 주장을 하나도 뽑지 못했다면 거의 틀린 판단입니다. 다시 읽으세요.
"없다 · 존재하지 않는다 · 확인되지 않는다 · 오기다"처럼 부정하는 문장도 전부 검증할 사실 주장입니다.
바로잡아 준 조문의 내용, 제시한 형량·용량·수치·연도도 전부 주장입니다. 찾아서 뽑아 주세요.
정말로 하나도 없으면(인사·의견·순수한 질문) 빈 배열로 두고 note에 이유를 쓰세요.`;

async function extractClaimsOnly(text, { ledger = null } = {}) {
  const ask = (extra = "") =>
    callClaudeJson({
      system: EXTRACT_ONLY_PROMPT,
      user: `다음 글에서 검증할 사실 주장을 뽑아줘:\n\n${text}${extra}`,
      maxTokens: 3000,
      ledger,
      label: extra ? "extract:retry" : "extract",
      // 검색이 없어 값이 싸다(한 건 약 2~3원). 대신 판단은 Sonnet에게 — 어느 법 몇 조의 이야기인지
      // 알아보는 일은 Haiku가 자주 놓쳤고, 놓치면 법제처 대조 대신 비싼 웹 리서치로 넘어갔다.
      strong: true,
    });

  let parsed = await ask();
  const empty = (p) => !Array.isArray(p?.claims) || p.claims.length === 0;
  // 짧은 글이 빈손인 건 정상이다("오늘 뭐 먹지?"). 긴 글에서만 다시 묻는다.
  if (empty(parsed) && text.trim().length >= 200) {
    const second = await ask(`\n\n---\n${RETRY_HINT}`).catch(() => null);
    if (second && !empty(second)) parsed = second;
  }
  const claims = (Array.isArray(parsed.claims) ? parsed.claims : [])
    .filter((c) => c && String(c.text || "").trim())
    .map((c) => {
      const domain = ["법률", "의료", "금융", "역사", "과학", "일반"].includes(c.domain) ? c.domain : "일반";
      return {
        text: String(c.text).trim(),
        // 위치는 파이프라인 끝에서 원문과 맞춰 본다(claimSpan.js). 여기서는 받은 그대로만 둔다.
        ...(typeof c.quote === "string" && c.quote.trim() ? { quote: c.quote.trim().slice(0, 300) } : {}),
        domain,
        verdict: domain === "법률" ? "pending_legal_check" : "uncertain",
        explanation: "",
        sources: [],
        identifiers: Array.isArray(c.identifiers) ? c.identifiers : [],
        ...(domain === "법률" ? { legal_ref: c.legal_ref || { type: "unspecified", keyword: String(c.text).slice(0, 40) } } : {}),
      };
    });
  return {
    overall_domain: parsed.overall_domain || claims[0]?.domain || "일반",
    note: parsed.note || "",
    claims,
    related_products: Array.isArray(parsed.related_products) ? parsed.related_products.slice(0, 3) : [],
  };
}

async function verifyClaimsOnWeb(text, claims, { ledger = null, onProgress = () => {} } = {}) {
  const list = claims.map((c, i) => `${i + 1}. [${c.domain}] ${c.text}`).join("\n");
  // 주장 하나면 3회, 늘수록 1회씩 더(최대 6). 실측으로 한 주장에 3회를 넘기면 결론이 거의 안 바뀐다.
  const cap = Math.min(6, 2 + claims.length);
  const raw = await callClaudeStreaming({
    system: WEB_VERIFY_PROMPT,
    label: "web_verify",
    ledger,
    messages: [{ role: "user", content: `원문(문맥 참고용):\n${text.slice(0, 4000)}\n\n판정할 주장:\n${list}` }],
    tools: searchTools(ledger, cap),
    max_tokens: 4000,
    onProgress,
  });
  // 검색을 여러 번 한 뒤에는 최종 JSON 없이 말로 끝나는 경우가 있다. 그때 검증 전체를 오류로
  // 끝내면 사용자는 아무것도 못 받는다 — 찾은 내용을 두고 JSON만 한 번 더 받는다(검색 없이, 싸다).
  // 그래도 안 되면 판정을 비워 둔 채 넘긴다. 뒤 단계(심층 리서치)가 이어서 본다.
  let parsed;
  try {
    parsed = extractJson(raw);
  } catch {
    try {
      const again = await callClaude({
        system: WEB_VERIFY_PROMPT,
        label: "web_verify:json",
        ledger,
        messages: [
          { role: "user", content: `판정할 주장:\n${list}` },
          { role: "assistant", content: raw.slice(-6000) || "(검색 결과 정리 중)" },
          { role: "user", content: "지금까지 찾은 내용만으로 최종 판정을 요청한 JSON 형식 하나로만 출력하세요. 설명이나 코드블록 없이." },
        ],
        max_tokens: 2000,
      });
      parsed = extractJson(again);
    } catch {
      parsed = { summary: null, results: [] };
    }
  }
  const byN = new Map((Array.isArray(parsed.results) ? parsed.results : []).map((r) => [Number(r.n), r]));
  return {
    summary: parsed.summary || null,
    claims: claims.map((c, i) => {
      const r = byN.get(i + 1);
      if (!r) return c;
      const verdict = ["confirmed", "false", "uncertain"].includes(r.verdict) ? r.verdict : "uncertain";
      return { ...c, verdict, explanation: String(r.explanation || "").slice(0, 400), sources: Array.isArray(r.sources) ? r.sources.slice(0, 3) : [] };
    }),
  };
}

async function extractAndVerifySplit(text, onProgress, { ledger, references = [] }) {
  const extracted = await extractClaimsOnly(text, { ledger });
  if (!extracted.claims.length) {
    return { overall_domain: extracted.overall_domain, summary: extracted.note || "확인할 사실 주장이 없습니다.", claims: [], related_products: [] };
  }
  let claims = [...extracted.claims];
  // 기업이 기준 자료를 함께 보냈으면, 그 자료가 다루는 주장은 웹보다 먼저 그 자료와 대조한다.
  // 대조가 끝난 주장은 웹 판정에서 빼서 검색 비용도 아낀다. 실패하면 기준 자료 없이 계속한다.
  if (references.length) {
    onProgress(`${claims.length}개 주장을 찾았습니다. 보내 주신 기준 자료와 먼저 대조하는 중…`);
    const { checkAgainstReferences } = await import("./referenceCheck.js");
    claims = await checkAgainstReferences(claims, references, { ledger }).catch(() => claims);
  }
  const webIdx = claims.map((c, i) => (c.domain === "법률" || c.from_reference ? -1 : i)).filter((i) => i >= 0);
  let summary = null;
  if (webIdx.length) {
    onProgress(`${extracted.claims.length}개 주장을 찾았습니다. 웹에서 확인하는 중…`);
    const verified = await verifyClaimsOnWeb(text, webIdx.map((i) => claims[i]), { ledger, onProgress });
    summary = verified.summary;
    webIdx.forEach((ci, k) => { claims[ci] = verified.claims[k]; });
  }
  return { overall_domain: extracted.overall_domain, summary, claims, related_products: extracted.related_products };
}

export async function extractAndVerify(text, onProgress = () => {}, { ledger = null, references = [] } = {}) {
  // 기준 자료 대조는 나눠 부르는 경로에만 있다. 기준 자료가 오면 비상용 한 번 호출 모드여도 나눠 부른다.
  if (process.env.YUME_EXTRACT_MODE !== "single" || references.length) return extractAndVerifySplit(text, onProgress, { ledger, references });
  const raw = await callClaudeStreaming({
    system: EXTRACT_SYSTEM_PROMPT,
    label: "extract",
    ledger,
    messages: [{ role: "user", content: `다음 내용을 검증해줘:\n\n${text}` }],
    tools: searchTools(ledger, 6),
    max_tokens: 8000,
    onProgress,
  });
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    // 모델이 "왜 없는지"까지 적어 보냈으면 그건 놓친 것이 아니라 판단한 것이다.
    // 한 줄 질문을 열면서 이 경우가 흔해졌다 — "오늘 뭐 먹을까?"에는 정말로 확인할
    // 주장이 없다. 그때마다 한 번 더 부르면 아무것도 못 건지는 호출에 매번 돈을 쓴다.
    if (String(parsed.summary || "").trim().length >= 10) return { ...parsed, claims: [] };

    // 설명 없이 빈손으로 왔으면 한 번은 더 시도한다 — 주장 단위를 잘게 잡으라고
    // 알려주면 건지는 경우가 많다.
    // 그래도 없으면 오류로 끝내지 않는다. 사실 주장이 없는 글(인사말·의견·창작)일 수 있고,
    // 그때는 "검증할 게 없었다"고 알려주는 편이 검증 실패 화면보다 정확하다.
    const retry = await callClaudeStreaming({
      system: EXTRACT_SYSTEM_PROMPT,
      label: "extract:retry",
      ledger,
      messages: [
        { role: "user", content: `다음 내용을 검증해줘:

${text}` },
        { role: "assistant", content: raw.slice(0, 500) },
        { role: "user", content: "검증 가능한 사실 주장이 하나도 안 잡혔습니다. 숫자·연도·인물·기관·인과관계처럼 참/거짓을 가릴 수 있는 문장을 더 잘게 나눠 다시 추출해주세요. 짧은 질문이면 질문 형식('~라는데 사실이야?')을 벗기고 그 안의 주장을 뽑으면 됩니다. 정말로 사실 주장이 없으면 claims를 빈 배열로 두고 summary에 그 이유를 쓰세요." },
      ],
      tools: searchTools(ledger, 2),
      max_tokens: 8000,
      onProgress,
    });
    const second = extractJson(retry);
    if (Array.isArray(second.claims) && second.claims.length > 0) return second;
    return { ...second, claims: [] };
  }
  return parsed;
}

// ── 틀린 문장을 어떻게 고치면 되는지 ──────────────────────────────────────────
//
// 기업이 판정을 받고 다음에 하는 일은 그 문장을 고치는 것이다. "사실과 다름 — 실제로는
// 3년"까지만 주면, 보도자료 담당자는 문장을 다시 쓰다가 또 틀린다. 고친 문장까지 주면
// 그대로 바꿔 넣는다. 이게 "판정 도구"와 "검수 도구"의 차이다.
//
// 판정이 다 끝난 뒤 한 번만 부른다. 판정 경로(웹·법제처·심층 재확인·지목 재확인)마다
// 따로 쓰게 하면 경로가 늘 때마다 빠뜨린다. 여기서는 최종 판정이 "사실과 다름"인 것만,
// 그 판정의 설명에 적힌 실제 값만으로 고친다 — 새로운 사실을 지어낼 자리가 아니다.
const FIX_PROMPT = `당신은 '유메' 팩트체크의 마지막 단계입니다. 아래 항목들은 이미 "사실과 다름"으로 판정이 끝났습니다. 각 항목의 원문 문장을, 판정 근거에 적힌 실제 값에 맞게 고친 문장을 쓰세요.

- 원문의 문체·어조·길이를 그대로 두고 **틀린 부분만** 바꾸세요. 다른 부분을 다듬지 마세요.
- 고칠 값은 **판정 근거에 적힌 것만** 쓰세요. 근거에 실제 값이 없으면 지어내지 말고 fix를 빈 문자열로 두세요.
- "존재하지 않는 조문·판례·논문"처럼 대상 자체가 없으면, 그 인용을 빼거나 근거에 나온 실제 대상으로 바꾼 문장을 쓰세요. 바꿀 대상이 근거에 없으면 인용을 뺀 문장을 쓰세요.

반드시 아래 JSON으로만 답하세요.
{"fixes":[{"n":1,"fix":"고친 문장"}]}`;

export async function writeSuggestedFixes(claims, { ledger = null } = {}) {
  const targets = claims
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.verdict === "false" && String(c.explanation || "").trim());
  if (!targets.length) return claims;
  const list = targets
    .map(({ c }, k) => `${k + 1}. 원문 문장: ${c.quote || c.text}\n   판정 근거: ${String(c.explanation).slice(0, 400)}`)
    .join("\n\n");
  const parsed = await callClaudeJson({ system: FIX_PROMPT, user: list, maxTokens: 1500, ledger, label: "fix" });
  const byN = new Map((Array.isArray(parsed?.fixes) ? parsed.fixes : []).map((f) => [Number(f.n), String(f.fix || "").trim()]));
  const out = [...claims];
  targets.forEach(({ c, i }, k) => {
    const fix = byN.get(k + 1);
    // 원문과 같으면 고친 게 아니다. 너무 길면 문장이 아니라 해설을 쓴 것이다.
    if (fix && fix !== (c.quote || c.text).trim() && fix.length <= 400) out[i] = { ...c, suggested_fix: fix };
  });
  return out;
}

// ── 독립 판정(근거 잠금, evidenceLock.js) ────────────────────────────────────
// 처음 판정을 알려주지 않는다. 알려주면 검토자는 그쪽으로 기운다 — 그러면 두 번 본 게 아니라
// 한 번 본 것을 두 번 말한 것이 된다. 근거는 출처 페이지에 실제로 있다고 서버가 확인한 문장뿐이다.
const JUDGE_PROMPT = `당신은 '유메' 팩트체크의 독립 검토자입니다. 각 항목에는 주장 하나와, 출처 페이지에 실제로 있다고 확인된 문장들이 있습니다. **그 문장들만 근거로** 판단하세요. 배경지식으로 보태지 마세요.

- supports: 문장이 주장의 핵심(주체·수치·시점·조건)을 그대로 뒷받침한다.
- contradicts: 문장이 같은 대상에 대해 주장과 다른 값·사실을 말한다.
- unrelated: 문장이 주장을 직접 다루지 않거나, 문장만으로는 판단할 수 없다.

애매하면 unrelated입니다. 표기 차이·반올림처럼 핵심이 같으면 supports, 핵심 값이 다르면 contradicts입니다.

반드시 아래 JSON으로만 답하세요.
{"results":[{"n":1,"relation":"supports|contradicts|unrelated"}]}`;

export async function judgeEvidence(items, { ledger = null } = {}) {
  const list = items
    .map((it, k) => `${k + 1}. 주장: ${it.claim}\n   확인된 문장:\n${it.excerpts.map((e) => `   - "${String(e).slice(0, 300)}"`).join("\n")}`)
    .join("\n\n");
  const parsed = await callClaudeJson({ system: JUDGE_PROMPT, user: list, maxTokens: 1200, ledger, label: "judge", strong: true });
  const byN = new Map((Array.isArray(parsed?.results) ? parsed.results : []).map((r) => [Number(r.n), r.relation]));
  return items.map((_, k) => {
    const r = byN.get(k + 1);
    return ["supports", "contradicts", "unrelated"].includes(r) ? r : null;
  });
}

const GROUNDING_SYSTEM_PROMPT = `당신은 유메의 법률 판정 보조입니다. 웹검색을 쓰지 말고, 아래 제공된 "공식 조회 결과" 텍스트만 근거로 판단하세요. 배경지식으로 추측하지 마세요. 공식 텍스트에 없는 내용은 판단하지 마세요.

중요 — 이 "공식 조회 결과"는 법제처 국가법령정보에서 오늘 기준으로 실제 시행 중인 최신 버전만 조회한 것입니다. 함께 제공되는 시행일자는 이 조문의 현재 버전이 언제부터 적용되는지를 뜻합니다.
- 주장이 이 현재 시행 중인 조문 내용과 다르면, 그 표현이 과거 판례·구법 조문·이전 개정판에 실제로 존재했던 문구라 하더라도 반드시 verdict를 "false"로 판정하세요. explanation에는 단순히 "틀렸다"가 아니라, 현재는 구체적으로 어떻게 규정되어 있는지(현행 조문 요약)를 근거로 무엇이 어떻게 달라졌는지 설명하세요. 예: "해당 내용은 개정 전 조문 기준이며, 현재는 (현행 조문 요약)으로 개정되었습니다."
- 제공된 공식 텍스트가 비어 있거나 주장과 관련된 부분을 전혀 포함하지 않아 판단 근거로 삼을 수 없다면, 추측하지 말고 verdict를 "uncertain"으로 하고 explanation에 "개정 이력 확인 불가, 최신 조문과의 일치 여부 미확인"이라고 정직하게 표시하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명을 추가하지 마세요.
{"verdict": "confirmed|false|uncertain", "explanation": "100자 이내, 공식 텍스트의 어느 부분과 왜 일치/불일치하는지 구체적으로"}`;

export async function groundLegalClaim(claimText, officialText, meta = {}) {
  const dateLine = meta.effectiveDate ? `\n(이 조문의 현재 버전 시행일자: ${meta.effectiveDate})` : "";
  const raw = await callClaude({
    system: GROUNDING_SYSTEM_PROMPT,
    // 여기는 Haiku로 내리지 않는다. "주어진 조문과 주장을 비교하는 기계적인 일"처럼
    // 보이지만 실제로는 유메의 판정이 정해지는 자리다 — 개정 전 문구와 현행 조문의
    // 차이, 요건 하나가 빠진 인용, 조문에 없는 기간·금액이 덧붙은 경우를 가려내야 한다.
    // 값이 싸다고 여기를 바꾸면 아낀 돈보다 놓친 오류가 비싸다.
    label: "ground",
    ledger: meta.ledger || null,
    messages: [
      {
        role: "user",
        content: `주장: ${claimText}\n\n공식 조회 결과 (${meta.label || "법제처 국가법령정보 공동활용 API"}):${dateLine}\n${officialText}`,
      },
    ],
    max_tokens: 500,
  });
  return extractJson(raw);
}

const WEB_FALLBACK_SYSTEM_PROMPT = `당신은 유메의 법률 리서치 보조입니다. 이 법률 관련 주장은 법제처 국가법령정보 공동활용 API로 조문·판례 번호를 특정해서 공식 조회를 할 수 없었습니다(조문/사건번호가 불명확하거나, 법령·판례 자체를 특정하지 못함).

그렇다고 "모른다"고 답하지 마세요. web_search 도구로 실제로 검색해서(뉴스, 법률사무소·변호사 해설 블로그, 판례 정리 사이트, 정부 발표 자료 등) 이 주장이 맞는지 최선을 다해 판단하세요. 검색 없이 배경지식만으로 답하지 말고, 반드시 최소 1회 이상 검색하세요(최대 3회).

판단 원칙:
- 검색 결과가 명확히 뒷받침하거나 반박하면 confirmed/false로 판정하고, 실제로 찾은 출처를 제시하세요.
- 검색해도 신뢰할 만한 근거를 전혀 찾지 못했을 때만 uncertain으로 하되, 이 경우에도 무엇을 검색해봤는지 explanation에 간단히 남기세요.

식별자 확인이 함께 요청된 경우(요청에 "인용된 식별자"가 적혀 있으면):
- 그 판례 사건번호·법령·조문이 실제로 존재하는지도 검색으로 확인하세요. 법원·정부·언론·법률 전문 사이트처럼 신뢰할 만한 출처에서 그 식별자가 실제 사건·법령을 가리키는 것이 확인될 때만 identifier_found를 true로 하세요. AI가 만든 글이나 출처 없는 요약에만 나오면 false입니다.
- 공식 데이터베이스에서는 이미 찾지 못한 상태이므로, 존재를 확인하지 못했다면 주장 내용이 그럴듯해 보여도 verdict를 confirmed로 하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 마크다운 코드블록을 추가하지 마세요.
{"verdict": "confirmed|false|uncertain", "explanation": "구체적 근거 (100자 이내)", "sources": [{ "title": "출처 제목", "url": "https://...", "quote": "그 페이지에서 근거가 된 문장을 한 글자도 바꾸지 않고 그대로" }], "identifier_found": true|false}`;

export async function verifyLegalClaimViaWeb(claimText, onProgress = () => {}, { identifier = null, ledger = null } = {}) {
  const idLine = identifier ? `\n\n인용된 식별자: ${identifier} (법제처 공식 데이터베이스에서는 찾지 못함)` : "";
  const raw = await callClaudeStreaming({
    system: WEB_FALLBACK_SYSTEM_PROMPT,
    label: "legal_web",
    ledger,
    messages: [{ role: "user", content: `다음 법률 관련 주장을 검색해서 검증해줘:\n\n${claimText}${idLine}` }],
    tools: searchTools(ledger, 4),
    max_tokens: 2000,
    onProgress,
  });
  const parsed = extractJson(raw);
  return {
    verdict: parsed.verdict || "uncertain",
    explanation: parsed.explanation || "",
    sources: parsed.sources || [],
    identifier_found: parsed.identifier_found === true,
  };
}

// ── 마지막 판단 보류 일소 ────────────────────────────────────────────────
// 앞 단계(공식 대조·부존재 신뢰도·1차 웹 확인)를 모두 거치고도 uncertain으로 남은 주장을
// 도메인에 맞춰 한 번 더 파고든다. 목표는 "모른다"로 끝나는 답을 없애는 것이다.
// 그래도 결론이 안 서면 uncertain을 유지하되, 최소한 "무엇을 확인했고 무엇이 남았는지"는
// 반드시 남긴다 — 근거 없는 단정보다 낫고, 아무 말 없는 보류보다 훨씬 쓸모 있다.

const RESEARCH_SYSTEM_PROMPT = `당신은 유메의 심층 리서치 담당입니다. 이 주장은 앞선 검증에서 결론이 나지 않았습니다. 당신이 마지막 단계입니다.

가장 중요한 원칙 두 가지입니다. 둘 다 지켜야 합니다.

1. **끝까지 찾으세요.** 배경지식으로 추측하지 말고, web_search 도구로 각도를 바꿔가며 실제로 검색하세요(최대 3회, 서버가 강제합니다). 한도를 아끼지 마세요 — 여기서 못 찾으면 그대로 '확인되지 않음'이 됩니다. 처음 검색이 빈손이면 검색어를 바꿔서 다시 시도하세요 — 용어를 바꾸고, 상위 개념으로 넓히고, 영어로도 찾아보세요.

2. **찾지 못했으면 찾지 못했다고, 정확히 어디까지 찾았는지와 함께 말하세요.** 그럴듯하다는 이유로 confirmed를 주면 안 됩니다. 그건 당신의 추측이지 검증이 아닙니다.
   다만 "못 찾았다"는 것 자체가 유메에게는 중요한 결과입니다. 유메는 당신이 어디를 얼마나 뒤졌는지를 받아서 **부존재 신뢰도**를 계산합니다 — 사실이라면 반드시 기록으로 남았을 내용인데 그 기록이 어디에도 없다면, 그 주장은 지어낸 것으로 판정됩니다. 그러니 verdict만 주지 말고 아래 세 필드를 정확히 채우세요.

도메인별로 이런 자료를 우선 찾으세요:
- 법률: 법제처·대법원·정부 부처 발표, 법무법인 해설, 판례 정리 사이트
- 의료: 질병관리청·식약처·대한의학회 등 학회 가이드라인, 교과서적 표준, 리뷰 논문
- 금융: 금융위·금감원·한국은행 발표, 거래소 공시, 주요 경제지
- 역사·과학: 학술 데이터베이스, 대학·연구기관 자료, 표준 레퍼런스
- 일반: 1차 출처(발표 주체 본인의 공식 자료)를 최우선으로

판정 기준:
- 신뢰할 만한 출처가 주장을 뒷받침하면 "confirmed".
- 주장이 사실과 다르거나, 숫자·연도·주체·인과관계가 틀렸으면 "false". 무엇이 어떻게 다른지 정확한 내용을 함께 쓰세요 — **근거가 말하는 실제 값을 반드시 적으세요.** 실제 값을 댈 수 없으면 그건 반박이 아니라 미확인이므로 "uncertain"입니다.
- 주장의 핵심이 맞고 곁가지만 조금 다르면(반올림, 표기 차이, 근소한 가격 차) "false"가 아닙니다. "confirmed"로 하고 다른 점을 설명에 덧붙이세요. 틀린 부분이 핵심일 때만 "false"로 하고, 맞는 부분과 틀린 부분을 구분해 설명하세요.
- 주장이 애초에 조건에 따라 달라지는 것이라면(예: 지역·시점·대상에 따라 다름) "uncertain"이 아니라, 어떤 조건에서 맞고 어떤 조건에서 틀린지를 설명한 뒤 가장 일반적인 경우를 기준으로 판정하세요.

"uncertain"을 쓸 때는 explanation에 반드시 이 세 가지를 담으세요:
  ① 무엇을 검색했는지 ② 무엇까지 확인됐는지 ③ 무엇이 확인되면 결론이 나는지.
explanation을 비워두거나 "확인할 수 없습니다" 한 줄로 끝내면 안 됩니다. 어디까지 갔는지를 남겨야 사용자가 그다음을 할 수 있습니다.

confirmed나 false로 판정할 때는 sources에 실제로 근거가 된 URL을 반드시 넣으세요. 출처 없는 confirmed·false는 유메가 자동으로 "확인되지 않음"으로 내립니다.
**sources마다 quote에 그 페이지에서 근거가 된 문장을 한 글자도 바꾸지 말고 그대로 옮기세요**(최대 200자, 실제로 본 문장만). 유메가 그 페이지를 직접 열어 문장이 정말 있는지, 그 문장이 판정을 뒷받침하는지 대조합니다. 요약하거나 지어내면 판정이 거둬집니다.

추가로 채워야 할 세 필드:

**recordedness** — 이 주장이 **사실이라면** 어디에 기록되어 있어야 하는지. 실제로 찾았는지와 무관하게 고르세요.

판단 기준이 중요합니다. "이런 정보가 어딘가 있을 법한가"가 아니라 **"이 주장이 스스로 어떤 기록의 존재를 주장하고 있는가"**로 고르세요.
- 주장이 "집계되었다", "조사 결과", "발표했다", "통계에 따르면", "제정되었다", "선정되었다"처럼 **구체적 수치·날짜·고유명을 확언**한다면, 그건 공표된 기록이 존재한다고 주장하는 것입니다 → public_record 또는 reported. 그런 기록이 실제로 없다면 그 주장은 지어낸 것이고, 그렇게 판정되어야 합니다.
- 해당 분야에 공식 통계 분류가 없다는 것은 niche로 내릴 이유가 아니라, **오히려 그런 집계가 존재하지 않는다는 근거**입니다. 존재하지 않는 집계를 인용한 주장은 지어낸 것입니다.
- 다만 이 논리는 **집계·수치·기록**에만 씁니다. 개체의 존재 자체에는 쓰지 마세요 — 통계는 없으면 인용할 수 없지만, 회사는 기록에 없어도 존재할 수 있습니다.
- niche는 구체적 수치를 확언하지 않고 업계 관행·경향을 말하는 주장에만 쓰세요.
- "public_record": 정부·공공기관이 공표하는 통계·공시·관보·등기 (예: 인구 통계, 기업 공시, 법령 시행일)
- "published": 논문·도서·보고서로 출판되는 내용 (예: 연구 결과, 학술적 사실)
- "reported": 언론이 보도하거나 기관이 공식 발표하는 내용 (예: 사건, 인사, 제품 출시, 수상)
- "niche": 업계·전문 영역에서만 유통되는 자료 (예: 특정 업종 관행, 소규모 커뮤니티 정보)
- "private": 공개 의무가 없는 개별 주체의 내부 정보 (예: 비상장사 매출, 개인 간 계약)
- "unrecordable": 애초에 공개 기록으로 남지 않는 것 (예: 개인 경험, 미래 예측, 주관적 평가)

**특히 주의 — "무엇이 존재한다"는 주장.**
회사·가게·단체·사람이 존재한다는 주장은 웹에 흔적이 없다고 없는 것이 아닙니다. 비상장 소규모 법인, 이번 달에 낸 사업자등록, 1인 사업자, 동네 가게는 검색해도 나오지 않는 게 정상입니다. 이런 주장은 상장사·공시 의무가 있는 법인처럼 **공개가 강제되는 경우가 아니면 "private"** 로 고르세요.
찾지 못했다고 "존재하지 않는다"고 판정하면, 갓 시작한 사업자를 없는 사람으로 만듭니다. 존재를 부정하려면 검색에 안 나오는 것 말고 실제 근거(폐업 공고, 등기 말소, 사칭으로 확인된 보도)가 있어야 합니다.
**그 주체 하나의 활동도 같습니다.** 이름이 특정된 소규모·신생·비상장 조직 **한 곳**의 출시·계약·채용·행사는 언론이 보도할 의무가 없습니다. 상장사·공공기관·대기업처럼 보도와 공시가 사실상 강제되는 주체가 아니면 "reported"가 아니라 "private"로 고르세요.
단, **여러 주체를 묶은 집계·평균·통계·순위**("○○ 업계 평균", "지역 공방 평균 객단가", "△△ 이용자 비율")는 이 예외가 아닙니다. 그런 주장은 누군가 집계해 공표했어야 성립하므로 위 기준대로 public_record·reported입니다.

**subject_found** — 주장이 **이름이 특정된 주체 하나**(회사·기관·사람·제품)에 관한 것일 때, 그 주체를 검색에서 찾았으면 true, 주체 자체를 찾지 못했으면 false. 주체를 못 찾았다면 그 주체에 관한 기록이 없는 것은 당연하므로, 유메는 이 경우 부존재로 단정하지 않습니다. 특정 주체 하나가 아닌 주장(집계·통계·평균·과학 사실·일반 상식)이면 **항상 true**로 두세요.

**특히 주의 — 남이 매긴 평가·등급·수상 기록.**
잡지 평점, 심사 결과, 업계 랭킹, 구독자 전용 데이터베이스의 수치는 **사실이어도 일반 웹검색에 안 걸립니다.** 와인·위스키 평점(Wine Enthusiast, James Suckling, Wine Spectator 등), 영화·음식 평가, 유료 산업 리포트, 학술 유료 DB가 모두 그렇습니다. 이런 주장은 recordedness를 "niche"로 고르세요 — 회원 전용·유료 자료가 검색공간의 대부분이라 뒤져도 덮이지 않는 것이 정상입니다.
검색이 빈손이었다고 "그런 평점은 없다"고 판정하면 안 됩니다. 평점을 부정하려면 **그 매체가 실제로 매긴 다른 점수**를 찾아야 합니다. 못 찾았으면 uncertain입니다.

**searched_thoroughly** — 위 recordedness에 해당하는 곳을 실제로 납득할 만큼 뒤졌으면 true. 검색을 한두 번만 하고 포기했으면 false.

**near_miss** — 주장과 비슷하지만 다른 실재 사실을 찾았다면 적으세요. 숫자만 다른 통계, 연도만 다른 사건, 이름이 비슷한 기관 등. 이게 있으면 지어낸 것이 아니라 잘못 기억한 것일 수 있어 유메가 부존재로 단정하지 않습니다. 없으면 null.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 마크다운 코드블록을 추가하지 마세요.
{"verdict": "confirmed|false|uncertain", "explanation": "구체적 근거 (200자 이내)", "sources": [{ "title": "출처 제목", "url": "https://...", "quote": "그 페이지에서 근거가 된 문장 그대로" }], "recordedness": "public_record|published|reported|niche|private|unrecordable", "searched_thoroughly": true|false, "subject_found": true|false, "near_miss": { "value": "찾은 비슷한 실재 사실", "similarity": 0.0~1.0 } }`;

export async function researchClaim(claimText, { domain = "일반", priorExplanation = "", priorSources = [], onProgress = () => {}, ledger = null } = {}) {
  const prior = priorExplanation ? `\n\n앞선 검증에서 여기까지는 확인했습니다(이걸 반복하지 말고 더 파고드세요): ${priorExplanation}` : "";
  const seen = priorSources.length
    ? `\n이미 본 출처: ${priorSources.map((x) => x.url).filter(Boolean).slice(0, 3).join(", ")}`
    : "";
  const raw = await callClaudeStreaming({
    system: RESEARCH_SYSTEM_PROMPT,
    label: "research",
    ledger,
    messages: [{ role: "user", content: `도메인: ${domain}\n주장: ${claimText}${prior}${seen}` }],
    tools: searchTools(ledger, 3),
    max_tokens: 3000,
    onProgress,
  });
  const parsed = extractJson(raw);
  const near = parsed.near_miss;
  return {
    verdict: parsed.verdict || "uncertain",
    explanation: String(parsed.explanation || "").trim(),
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    recordedness: RECORDEDNESS.includes(parsed.recordedness) ? parsed.recordedness : "niche",
    searchedThoroughly: parsed.searched_thoroughly === true,
    // 명시적으로 false일 때만 "주체를 못 찾았다"로 본다. 필드가 빠졌으면 예전처럼 판단한다.
    subjectFound: parsed.subject_found !== false,
    nearMiss: near && near.value ? { value: String(near.value), similarity: Math.max(0, Math.min(1, Number(near.similarity) || 0)) } : null,
  };
}

// ── 지목 재확인 ─────────────────────────────────────────────────────────
// 유메가 낼 수 있는 가장 해로운 오류는 잘못된 "사실과 다름"이다. 못 찾은 걸 못 찾았다고
// 하는 건 정직한 결과지만, 맞는 정보를 거짓이라고 하면 사용자는 멀쩡한 사실을 버린다.
//
// 그래서 지목(false)에만 한 번 더 본다. 그것도 웹·리서치로 나온 것만 — 법제처 조문
// 대조(official)와 부존재 신뢰도(nec)는 근거가 형식적으로 확정돼 있어 다시 볼 게 없다.
// 검색이 딸려오지 않으므로 값이 싸고, 지목은 원래 소수라 검증당 0~1회에 그친다.
const ACCUSATION_REVIEW_PROMPT = `당신은 팩트체크 판정의 마지막 검토자입니다. 어떤 주장이 "사실과 다름"으로 지목됐습니다. 그 지목을 그대로 내보내도 되는지만 판단하세요.

이 자리에 비용을 쓰는 이유가 있습니다. 못 찾은 것을 못 찾았다고 하는 건 정직한 결과지만, **맞는 사실을 거짓이라고 지목하면 사용자는 멀쩡한 정보를 버립니다.** 근거까지 달려 있어 알아차리기도 어렵습니다. 이게 유메가 낼 수 있는 가장 비싼 오류입니다.

**직접 검색해서 확인하세요.** web_search를 최대 2회 쓸 수 있습니다. 사용자가 조금만 검색해도 보이는 사실을 유메가 거짓이라고 불러 놓은 경우가 실제로 있었습니다 — 그걸 여기서 잡아야 합니다. 검색어를 주장 그대로 넣지 말고, 그 사실이 실제로 적혀 있을 자리를 노려서 찾으세요(발표 주체의 공식 페이지, 원문 매체, 영어 표기).

지목을 유지하려면(uphold) **"그럼 실제로는 무엇인가"를 댈 수 있어야 합니다.**
- 근거나 검색 결과가 주장과 정면으로 어긋난다. 그리고 그 다른 값(숫자·연도·주체)을 지금 말할 수 있다.
- 주장이 부분적으로만 맞고, 틀린 부분이 주장의 핵심이다.

지목을 거둬야 하는 경우(withdraw):
- **뒷받침하는 자료를 못 찾은 것뿐이다.** 이건 "틀렸다"가 아니라 "확인되지 않았다"이다. 가장 흔한 실수다.
- 검색에 걸리지 않는 기록일 수 있다. 잡지 평점, 심사 결과, 구독자 전용 데이터베이스, 유료 리포트, 지면 기사는 사실이어도 웹검색에 안 나온다.
- 근거가 주장과 다른 것을 말하고 있다(주제가 비슷할 뿐 같은 사안이 아니다).
- 표현 차이일 뿐 내용은 같다. 반올림, 요약, 같은 뜻의 다른 표기, 근소한 가격 차는 틀린 게 아니다.
- 주장이 조건부로 맞는데, 근거는 다른 조건을 말하고 있다.
- 판이 여럿인 대상(와인 빈티지, 제품 연식, 해마다 다른 통계)인데 주장이 판을 특정하지 않았고, 지목 근거가 **다른 판의 값**이다.
- 검색해 보니 오히려 주장이 맞았다.

반드시 아래 JSON 형식으로만 응답하세요. uphold일 때 counter_fact는 비울 수 없습니다 — 실제 값을 댈 수 없다면 그건 반박이 아니므로 withdraw입니다.
{"decision": "uphold|withdraw", "counter_fact": "근거가 말하는 실제 값 (uphold일 때만, 예: '실제 평점은 90점')", "reason": "판단 근거 (100자 이내)"}`;

export async function reviewAccusation({ claimText, explanation, sources = [], ledger = null }) {
  const evidence = sources.length
    ? sources.map((x, i) => `${i + 1}. ${x.title || "(제목 없음)"} — ${x.url || ""}`).join(String.fromCharCode(10))
    : "(제시된 출처 없음)";
  // 검색을 붙인다. 원래는 "주어진 근거만 보라"고 했는데, 그러면 첫 판정이 못 찾은 것을
  // 이 검토자도 똑같이 못 찾은 상태로 판단하게 된다. 사용자가 조금만 검색해도 보이는
  // 사실을 거짓이라고 불러 놓은 오류는 그 구조에서는 절대 잡히지 않는다.
  //
  // 검색은 유메에서 가장 비싼 항목이지만 이 자리에서는 값이 있다. 지목이 실제로 나온
  // 검증만 대상이고(대개 0건), 한 검증에서 최대 3건까지만 다시 보므로 상한이 6회다.
  const raw = await callClaude({
    system: ACCUSATION_REVIEW_PROMPT,
    label: "review",
    ledger,
    messages: [
      {
        role: "user",
        content: [`주장: ${claimText}`, `지목 사유: ${explanation}`, "제시된 근거:", evidence].join(String.fromCharCode(10, 10)),
      },
    ],
    tools: searchTools(ledger, 2),
    max_tokens: 1500,
  });
  const parsed = extractJson(raw);
  return {
    upheld: parsed.decision !== "withdraw",
    counterFact: String(parsed.counter_fact || "").trim(),
    reason: String(parsed.reason || "").trim(),
  };
}

const CHAT_SYSTEM_PROMPT = `당신은 '유메(YUME)' 웹사이트 우측 하단에 떠 있는 대화형 AI 어시스턴트입니다. 유메 자체는 AI 답변을 공식 데이터·웹검색으로 대조해주는 팩트체크 서비스이지만, 당신은 그 기능에 국한되지 않는 자유로운 대화 상대입니다.

- 유메 서비스에 대한 질문(무엇인지, 사용법, 요금제 — 무료/스탠다드 9,000원·월/전문가 29,000원·월, B2B·API·데이터셋 라인업 등)에는 정확히 안내하세요.
- 그 외에는 일상 대화, 잡담, 일반 지식, 의견을 묻는 질문 등 어떤 주제든 자연스럽고 성실하게 답하세요 — "사과는 맛있어?" 같은 가벼운 질문에도 실제로 대화하듯 답하면 됩니다. 유메와 무관하다고 회피하거나 다른 곳으로 안내하지 마세요.
- 친근하고 자연스러운 한국어로, 최대한 간결하게 답하세요(보통 1~3문장). 목록이나 자세한 설명을 명확히 요청받았을 때만 길게 답하세요.
- 인사말이나 자기소개를 이미 다른 곳에서 전달받았다면(예: 안내 문구가 대화 앞에 이미 붙어있다면) 스스로 다시 인사하거나 자기소개를 반복하지 말고, 사용자가 실제로 한 말에 곧바로 답하세요.
- 사실 여부가 중요한 긴 텍스트나 복잡한 법률·의료 주장을 검증해달라고 하면, 참고로 위쪽 검증창을 이용하면 더 꼼꼼히 봐준다고 안내는 하되, 대화 자체는 계속 이어가세요.
- 모르는 것은 모른다고 솔직히 말하세요.`;

// 카카오톡은 5초 안에 답해야 하므로 짧게 답하도록 따로 요청한다.
const KAKAO_CHAT_HINT = "\n\n지금은 카카오톡 채팅창이라 답은 3문장 이내로 짧게 하세요. 긴 설명이 필요하면 핵심만 말하고 더 궁금하면 물어보라고 하세요.";

export async function chatReply(messages, { channel = "web" } = {}) {
  const safeMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10);
  if (safeMessages.length === 0) throw new Error("메시지가 없습니다.");
  const text = await callClaude({
    system: channel === "kakao" ? CHAT_SYSTEM_PROMPT + KAKAO_CHAT_HINT : CHAT_SYSTEM_PROMPT,
    // 잡담·안내라 Haiku로 충분하다. 검증과 달리 판정이 걸려 있지 않다.
    model: FAST_MODEL,
    label: "chat",
    messages: safeMessages,
    max_tokens: channel === "kakao" ? 400 : 2000,
  });
  return text.trim();
}

// ── 캡처에서 글 읽어내기 ────────────────────────────────────────────────
//
// 왜 필요한가 — AI 대화를 유메로 가져오는 공식 경로가 사실상 없다. ChatGPT 공유
// 링크는 서버에서 열리지 않고(chatLink.js 참고), 앱에서 쓴 대화는 링크조차 없다.
// 반면 캡처는 어떤 서비스든, 앱이든 웹이든, 심지어 남의 화면을 찍은 것이든 된다.
// 막힌 경로를 우회하는 대신 아무 데서나 되는 경로를 하나 두는 쪽이 낫다.
//
// 읽기만 하고 판단은 하지 않는다. 여기서 "이건 틀렸다"까지 하면 검증 파이프라인이
// 둘로 갈라진다 — 캡처는 입력을 만드는 단계이고, 판정은 그다음 기존 경로가 한다.
export async function readScreenshot(images, { ledger = null } = {}) {
  const content = [
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    })),
    {
      type: "text",
      text:
        "이 캡처에서 **AI가 answer로 내놓은 글**만 그대로 옮겨 적어줘.\n" +
        "- 사람이 입력한 질문, 버튼·메뉴 글자, 시간·날짜 표시는 빼고 답변 본문만.\n" +
        "- 여러 장이면 이어지는 하나의 답변으로 보고 순서대로 이어 붙여.\n" +
        "- 내용을 요약하거나 고치지 말고 보이는 그대로. 잘려서 안 보이는 부분은 만들어내지 마.\n" +
        "- 답변으로 보이는 글이 전혀 없으면 빈 문자열.",
    },
  ];

  const text = await callClaude({
    system:
      "너는 화면 캡처에서 글자를 정확히 옮겨 적는 일만 한다. 판단하거나 요약하지 않는다. " +
      "보이지 않는 글자를 추측해서 채우지 않는다 — 안 보이면 안 보이는 대로 둔다.",
    messages: [{ role: "user", content }],
    // 강한 모델을 쓴다. 기계적인 작업이라 하이쿠로 충분할 줄 알았는데, 실측해 보니
    // 한글 법률 문장에서 사건번호를 "2021다283742 → 2021년1283742"로 바꾸고 문장 뜻까지
    // 뒤집었다. 팩트체크에서 입력을 잘못 읽는 것은 원가를 아끼는 것보다 훨씬 비싸다 —
    // 없는 사건번호를 만들어 놓고 "존재하지 않는다"고 판정하면 남의 AI에 없는 죄를 씌운다.
    model: MODEL,
    max_tokens: 4000,
    label: "screenshot",
    ledger,
  });
  return text.trim();
}
