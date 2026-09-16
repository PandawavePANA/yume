// Anthropic Messages API 호출 (서버 전용 — API 키는 절대 클라이언트로 내려가지 않음).
import { RECORDEDNESS } from "./nec/searchSpace.js";
import { classifyUpstream, noteUpstreamFailure, noteUpstreamSuccess } from "./upstream.js";
import { record } from "./apiCost.js";

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
  return JSON.parse(cleaned.slice(start, end + 1));
}

// 웹검색 없이 JSON 한 덩어리만 받아오는 단순 호출. 감사(audit) 채점처럼 "주어진 근거로
// 판단만 하라"는 작업에 쓴다 — 검색을 붙이면 채점자가 배경지식으로 추측하게 된다.
export async function callClaudeJson({ system, user, maxTokens = 800, ledger = null, label = "json" }) {
  const messages = [{ role: "user", content: user }];
  // 근거가 이미 주어진 판단이라 Haiku로 충분하다(감사 채점·인용 추출).
  const raw = await callClaude({ system, messages, max_tokens: maxTokens, model: FAST_MODEL, label, ledger });
  try {
    return extractJson(raw);
  } catch {
    // 형식이 어긋나면 한 번은 되묻는다. 감사 채점에서 이걸 포기하면 결과가
    // '채점 불가'로 남는데, 그건 대상 AI의 문제가 아니라 우리 쪽 문제다.
    const retry = await callClaude({
      system,
      model: FAST_MODEL,
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

const EXTRACT_SYSTEM_PROMPT = `당신은 '유메'라는 AI 답변 팩트체크 엔진입니다. 사용자가 붙여넣은 AI 답변 텍스트를 분석해서, 검증 가능한 사실 주장을 추출하고, 웹검색으로 각 주장이 실제로 맞는지 확인하세요.

규칙:
- 의견이나 추천처럼 사실 여부를 판단할 수 없는 문장은 제외하고, 검증 가능한 사실 주장만 추출합니다.
- 주장이 3~7개 정도 되도록 적당히 굵직한 단위로 나눕니다.
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
- 검색으로 근거를 찾았으면 반드시 confirmed 또는 false로 판정하세요. 주장이 부분적으로만 맞으면 uncertain이 아니라 false로 하고 어디가 틀렸는지 쓰세요. 조건에 따라 달라지는 주장이면 가장 일반적인 경우를 기준으로 판정하고 조건을 설명에 덧붙이세요.
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

export async function extractAndVerify(text, onProgress = () => {}, { ledger = null } = {}) {
  const raw = await callClaudeStreaming({
    system: EXTRACT_SYSTEM_PROMPT,
    label: "extract",
    ledger,
    messages: [{ role: "user", content: `다음 AI 답변을 검증해줘:\n\n${text}` }],
    tools: [webSearch(6)],
    max_tokens: 8000,
    onProgress,
  });
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    // 한 번은 더 시도한다 — 주장 단위를 잘게 잡으라고 알려주면 건지는 경우가 많다.
    // 그래도 없으면 오류로 끝내지 않는다. 사실 주장이 없는 글(인사말·의견·창작)일 수 있고,
    // 그때는 "검증할 게 없었다"고 알려주는 편이 검증 실패 화면보다 정확하다.
    const retry = await callClaudeStreaming({
      system: EXTRACT_SYSTEM_PROMPT,
      label: "extract:retry",
      ledger,
      messages: [
        { role: "user", content: `다음 AI 답변을 검증해줘:

${text}` },
        { role: "assistant", content: raw.slice(0, 500) },
        { role: "user", content: "검증 가능한 사실 주장이 하나도 안 잡혔습니다. 숫자·연도·인물·기관·인과관계처럼 참/거짓을 가릴 수 있는 문장을 더 잘게 나눠 다시 추출해주세요. 정말로 사실 주장이 없으면 claims를 빈 배열로 두고 summary에 그 이유를 쓰세요." },
      ],
      tools: [webSearch(3)],
      max_tokens: 8000,
      onProgress,
    });
    const second = extractJson(retry);
    if (Array.isArray(second.claims) && second.claims.length > 0) return second;
    return { ...second, claims: [] };
  }
  return parsed;
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
{"verdict": "confirmed|false|uncertain", "explanation": "구체적 근거 (100자 이내)", "sources": [{ "title": "출처 제목", "url": "https://..." }], "identifier_found": true|false}`;

export async function verifyLegalClaimViaWeb(claimText, onProgress = () => {}, { identifier = null, ledger = null } = {}) {
  const idLine = identifier ? `\n\n인용된 식별자: ${identifier} (법제처 공식 데이터베이스에서는 찾지 못함)` : "";
  const raw = await callClaudeStreaming({
    system: WEB_FALLBACK_SYSTEM_PROMPT,
    label: "legal_web",
    ledger,
    messages: [{ role: "user", content: `다음 법률 관련 주장을 검색해서 검증해줘:\n\n${claimText}${idLine}` }],
    tools: [webSearch(4)],
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
- 주장이 사실과 다르거나, 숫자·연도·주체·인과관계가 틀렸으면 "false". 무엇이 어떻게 다른지 정확한 내용을 함께 쓰세요.
- 주장이 부분적으로만 맞으면 "false"로 하고, 맞는 부분과 틀린 부분을 구분해 설명하세요.
- 주장이 애초에 조건에 따라 달라지는 것이라면(예: 지역·시점·대상에 따라 다름) "uncertain"이 아니라, 어떤 조건에서 맞고 어떤 조건에서 틀린지를 설명한 뒤 가장 일반적인 경우를 기준으로 판정하세요.

"uncertain"을 쓸 때는 explanation에 반드시 이 세 가지를 담으세요:
  ① 무엇을 검색했는지 ② 무엇까지 확인됐는지 ③ 무엇이 확인되면 결론이 나는지.
explanation을 비워두거나 "확인할 수 없습니다" 한 줄로 끝내면 안 됩니다. 어디까지 갔는지를 남겨야 사용자가 그다음을 할 수 있습니다.

confirmed나 false로 판정할 때는 sources에 실제로 근거가 된 URL을 반드시 넣으세요. 출처 없는 confirmed·false는 유메가 자동으로 "확인되지 않음"으로 내립니다.

추가로 채워야 할 세 필드:

**recordedness** — 이 주장이 **사실이라면** 어디에 기록되어 있어야 하는지. 실제로 찾았는지와 무관하게 고르세요.

판단 기준이 중요합니다. "이런 정보가 어딘가 있을 법한가"가 아니라 **"이 주장이 스스로 어떤 기록의 존재를 주장하고 있는가"**로 고르세요.
- 주장이 "집계되었다", "조사 결과", "발표했다", "통계에 따르면", "제정되었다", "선정되었다"처럼 **구체적 수치·날짜·고유명을 확언**한다면, 그건 공표된 기록이 존재한다고 주장하는 것입니다 → public_record 또는 reported. 그런 기록이 실제로 없다면 그 주장은 지어낸 것이고, 그렇게 판정되어야 합니다.
- 해당 분야에 공식 통계 분류가 없다는 것은 niche로 내릴 이유가 아니라, **오히려 그런 집계가 존재하지 않는다는 근거**입니다. 존재하지 않는 집계를 인용한 주장은 지어낸 것입니다.
- niche는 구체적 수치를 확언하지 않고 업계 관행·경향을 말하는 주장에만 쓰세요.
- "public_record": 정부·공공기관이 공표하는 통계·공시·관보·등기 (예: 인구 통계, 기업 공시, 법령 시행일)
- "published": 논문·도서·보고서로 출판되는 내용 (예: 연구 결과, 학술적 사실)
- "reported": 언론이 보도하거나 기관이 공식 발표하는 내용 (예: 사건, 인사, 제품 출시, 수상)
- "niche": 업계·전문 영역에서만 유통되는 자료 (예: 특정 업종 관행, 소규모 커뮤니티 정보)
- "private": 공개 의무가 없는 개별 주체의 내부 정보 (예: 비상장사 매출, 개인 간 계약)
- "unrecordable": 애초에 공개 기록으로 남지 않는 것 (예: 개인 경험, 미래 예측, 주관적 평가)

**searched_thoroughly** — 위 recordedness에 해당하는 곳을 실제로 납득할 만큼 뒤졌으면 true. 검색을 한두 번만 하고 포기했으면 false.

**near_miss** — 주장과 비슷하지만 다른 실재 사실을 찾았다면 적으세요. 숫자만 다른 통계, 연도만 다른 사건, 이름이 비슷한 기관 등. 이게 있으면 지어낸 것이 아니라 잘못 기억한 것일 수 있어 유메가 부존재로 단정하지 않습니다. 없으면 null.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 마크다운 코드블록을 추가하지 마세요.
{"verdict": "confirmed|false|uncertain", "explanation": "구체적 근거 (200자 이내)", "sources": [{ "title": "출처 제목", "url": "https://..." }], "recordedness": "public_record|published|reported|niche|private|unrecordable", "searched_thoroughly": true|false, "near_miss": { "value": "찾은 비슷한 실재 사실", "similarity": 0.0~1.0 } }`;

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
    tools: [webSearch(3)],
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
    nearMiss: near && near.value ? { value: String(near.value), similarity: Math.max(0, Math.min(1, Number(near.similarity) || 0)) } : null,
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
