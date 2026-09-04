// Anthropic Messages API 호출 (서버 전용 — API 키는 절대 클라이언트로 내려가지 않음).
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

function apiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.");
  return key;
}

async function callClaude({ system, messages, tools, max_tokens = 4000 }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages, ...(tools ? { tools } : {}) }),
  });
  const data = await res.json();
  if (data.type === "error") throw new Error(data.error?.message || "Claude API 오류");
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text.trim()) throw new Error("응답이 비어 있습니다. 입력을 조금 줄여서 다시 시도해주세요.");
  return text;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 형식을 찾지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const EXTRACT_SYSTEM_PROMPT = `당신은 '유메'라는 AI 답변 팩트체크 엔진입니다. 사용자가 붙여넣은 AI 답변 텍스트를 분석해서, 검증 가능한 사실 주장을 추출하고, 웹검색으로 각 주장이 실제로 맞는지 확인하세요.

규칙:
- 의견이나 추천처럼 사실 여부를 판단할 수 없는 문장은 제외하고, 검증 가능한 사실 주장만 추출합니다.
- 주장이 3~7개 정도 되도록 적당히 굵직한 단위로 나눕니다.
- 검색은 전체 답변을 통틀어 최대 5회까지만 사용하세요.
- 도메인을 "법률", "의료", "금융", "역사", "과학", "일반" 중 하나로 분류하세요.
- 원문이 이미 스스로 정정한 내용을 포함하고 있다면 정정된 최종 주장을 기준으로 판단하세요.
- domain이 "법률"인 주장은 이 단계에서 verdict를 판단하지 말고 반드시 "pending_legal_check"로 두세요. 법률 주장은 이후 단계에서 법제처 국가법령정보 공동활용 API로 별도 확인합니다. 대신 legal_ref를 최대한 구체적으로 채우세요:
  - 특정 법령 조문을 언급하면: {"type":"statute","law_name":"정확한 법령명(예: 민법, 형법)","article":"조문 번호(예: 750조, 32조 1항)"}
  - 특정 판례를 언급하면: {"type":"case","case_number":"사건번호(예: 2016다254467)","court":"법원명(모르면 생략 가능)"}
  - 조문이나 판례를 특정할 수 없을 만큼 모호하면: {"type":"unspecified","keyword":"검색에 쓸 핵심 키워드"}
- domain이 "법률"이 아닌 주장은 기존처럼 웹검색으로 confirmed/false/uncertain을 직접 판단하고, 거짓이거나 부정확하면 정확히 무엇이 왜 틀렸는지 구체적으로 설명하세요.
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
      "legal_ref": { "type": "statute|case|unspecified", "law_name": "", "article": "", "case_number": "", "court": "", "keyword": "" }
    }
  ],
  "related_products": [
    { "keyword": "쿠팡 검색용 키워드", "reason": "이 답변 내용과 어떻게 연결되는지 (40자 이내)" }
  ]
}
legal_ref 필드는 domain이 "법률"인 항목에만 포함하고, 그 외 항목에는 넣지 마세요.`;

export async function extractAndVerify(text) {
  const raw = await callClaude({
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `다음 AI 답변을 검증해줘:\n\n${text}` }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    max_tokens: 8000,
  });
  const parsed = extractJson(raw);
  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    throw new Error("검증 가능한 주장을 찾지 못했습니다.");
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

그렇다고 "모른다"고 답하지 마세요. web_search 도구로 실제로 검색해서(뉴스, 법률사무소·변호사 해설 블로그, 판례 정리 사이트, 정부 발표 자료 등) 이 주장이 맞는지 최선을 다해 판단하세요. 검색 없이 배경지식만으로 답하지 말고, 반드시 최소 1회 이상 검색하세요.

판단 원칙:
- 검색 결과가 명확히 뒷받침하거나 반박하면 confirmed/false로 판정하고, 실제로 찾은 출처를 제시하세요.
- 검색해도 신뢰할 만한 근거를 전혀 찾지 못했을 때만 uncertain으로 하되, 이 경우에도 무엇을 검색해봤는지 explanation에 간단히 남기세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 마크다운 코드블록을 추가하지 마세요.
{"verdict": "confirmed|false|uncertain", "explanation": "구체적 근거 (100자 이내)", "sources": [{ "title": "출처 제목", "url": "https://..." }]}`;

export async function verifyLegalClaimViaWeb(claimText) {
  const raw = await callClaude({
    system: WEB_FALLBACK_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `다음 법률 관련 주장을 검색해서 검증해줘:\n\n${claimText}` }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    max_tokens: 2000,
  });
  const parsed = extractJson(raw);
  return { verdict: parsed.verdict || "uncertain", explanation: parsed.explanation || "", sources: parsed.sources || [] };
}
