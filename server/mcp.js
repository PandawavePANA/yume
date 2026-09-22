// MCP 서버 — 유메를 ChatGPT·클로드 **안에서** 부를 수 있게 한다.
//
// 왜 이게 필요한가.
//
// 지금 유메를 쓰려면 AI가 준 답을 복사해서 유메로 옮겨야 한다. 그 한 걸음이 대부분을
// 걸러낸다. 답을 받은 자리에서 "이거 사실인지 확인해줘"로 끝나야 한다.
//
// 대화를 우리 쪽으로 가져오는 길은 사실상 막혀 있다 — ChatGPT 공유 링크는 서버에서
// 열리지 않고, 앱 대화는 링크조차 없다(chatLink.js 참고). 반대 방향은 열려 있다.
// OpenAI는 Apps SDK로, Anthropic은 Connectors로 서드파티 도구를 받고 있고, 둘 다
// MCP(Model Context Protocol)를 쓴다. 그래서 여기 하나를 만들면 양쪽에 다 붙는다.
//
// ── 규약 ──
// JSON-RPC 2.0을 HTTP POST로 주고받는다(Streamable HTTP). 지원하는 것:
//   initialize · tools/list · tools/call · ping · notifications/*
//
// ── 인증 ──
// 이미 있는 /v1 API 키를 그대로 쓴다(Authorization: Bearer). 새 인증 체계를 만들지
// 않는 이유는, 한도·과금·요율이 전부 그 키에 붙어 있어서다. 문을 하나 더 파면
// 한쪽만 조이는 실수가 반드시 생긴다.
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { authenticateApiKey, recordApiUsage, finishApiUsage } from "./apiKeys.js";
// 분당 한도 창과 월 사용량 계산은 /v1과 같은 것을 써야 한다 — 복사하면 한 키가
// 양쪽으로 두 배를 쓸 수 있게 된다.
import { usageInfo, withinRate } from "./apiV1.js";
import { startVerification, MAX_INPUT_CHARS } from "./verifyPipeline.js";
import { getVerification, newVerificationId } from "./verificationStore.js";
import { logError } from "./errorLog.js";

const router = patchAsync(express.Router());

// 클라이언트가 붙을 때 한 번 주고받는 값. 프로토콜 버전은 요청한 것을 그대로 돌려준다 —
// 우리가 아는 버전을 우기면 최신 클라이언트가 붙지 못한다.
const SERVER_INFO = { name: "yume", title: "유메 — AI 답변 팩트체크", version: "1.0.0" };
const FALLBACK_PROTOCOL = "2025-06-18";

// 판정이 나올 때까지 기다리는 상한.
//
// 실측에서 검색 3회짜리 법률 주장이 35초, 주장이 둘이면 50초도 넘겼다. 더 기다리는
// 것으로는 풀리지 않아서 — 클라이언트 타임아웃(보통 60초)에 먼저 걸린다 — 못 끝내면
// 확인 번호를 주고 get_verification_result로 다시 부르게 한다.
// 45초는 캐시에 걸린 것과 짧은 주장을 한 번에 끝내는 선이다.
const WAIT_MS = 45_000;

// 대기를 넘겼을 때 줄 결과 페이지 주소. 배포마다 도메인이 다르므로 환경변수를 먼저 본다.
const publicBase = () => (process.env.PUBLIC_BASE_URL || "https://www.yume-reamer.com").replace(/\/+$/, "");

const TOOLS = [
  {
    name: "verify_ai_answer",
    title: "AI 답변 사실 확인",
    description:
      "AI가 생성한 답변에서 사실 주장을 뽑아내 각각이 맞는지 확인합니다. " +
      "법률 주장은 법제처 국가법령정보와 직접 대조하고, 인용된 판례·법령·논문이 공식 자료에 없으면 " +
      "부존재 신뢰도를 수치로 냅니다. 확인하지 못한 것은 '거짓'이 아니라 '확인 불가'로 구분해 돌려줍니다. " +
      "사용자가 어떤 답변의 진위를 묻거나, 판례·법령·논문 인용이 포함된 답을 검토해 달라고 할 때 쓰세요.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: `확인할 AI 답변 전문. 최대 ${MAX_INPUT_CHARS}자.`,
        },
      },
      required: ["text"],
    },
  },
  {
    name: "get_verification_result",
    title: "확인 결과 가져오기",
    description:
      "verify_ai_answer가 시간 안에 끝나지 못하고 확인 번호만 돌려줬을 때, 그 번호로 결과를 가져옵니다. " +
      "검색이 여러 번 붙는 법률 주장은 1분을 넘기기도 합니다. 아직 진행 중이면 그렇게 알려주니 " +
      "20~30초 뒤에 다시 부르세요.",
    inputSchema: {
      type: "object",
      properties: {
        verification_id: { type: "string", description: "verify_ai_answer가 돌려준 확인 번호." },
      },
      required: ["verification_id"],
    },
  },
];

// ── JSON-RPC 껍데기 ────────────────────────────────────────────────────
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

// 도구가 "실패"한 것과 프로토콜이 실패한 것은 다르다. 도구 쪽 실패는 isError로 돌려줘야
// 모델이 그 사실을 읽고 사용자에게 설명할 수 있다 — JSON-RPC 오류로 던지면 그냥 끊긴다.
const toolText = (text, isError = false) => ({ content: [{ type: "text", text }], isError });

/** 판정 결과를 모델이 읽기 좋은 글로 옮긴다. */
function renderResult(v) {
  const r = v.result || {};
  const claims = Array.isArray(r.claims) ? r.claims : [];
  const VERDICT = { confirmed: "사실로 확인됨", false: "사실과 다름", uncertain: "확인 불가", unavailable: "확인 불가" };

  const lines = [];
  if (r.overall?.label) lines.push(`전체 판정: ${r.overall.label}`);
  lines.push(`검증한 주장 ${claims.length}개`);
  lines.push("");

  claims.forEach((c, i) => {
    lines.push(`${i + 1}. [${VERDICT[c.verdict] || c.verdict}] ${c.text}`);
    if (c.explanation) lines.push(`   ${c.explanation}`);
    const src = (c.sources || []).filter((s) => s?.url).slice(0, 3);
    for (const s of src) lines.push(`   근거: ${s.title || s.url} — ${s.url}`);
    if (c.verified_via === "official") lines.push("   (법제처 국가법령정보 원문과 대조함)");
    lines.push("");
  });

  // 이 한 줄을 빼면 안 된다. "확인 불가"를 모델이 "거짓"으로 옮겨 말하는 것이
  // 이 제품이 막으려는 바로 그 일이다.
  lines.push(
    "참고: '확인 불가'는 사실이 아니라는 뜻이 아니라, 공식 자료에서 확인하지 못했다는 뜻입니다. " +
      "이 판정은 참고 정보이며 전문가의 자문을 대신하지 않습니다.",
  );
  return lines.join("\n");
}

async function callTool(name, args, key) {
  if (name === "get_verification_result") return fetchResult(args, key);
  if (name !== "verify_ai_answer") return toolText(`알 수 없는 도구입니다: ${name}`, true);

  const text = typeof args?.text === "string" ? args.text.trim() : "";
  if (!text) return toolText("확인할 내용이 비어 있습니다. text에 AI 답변을 담아 보내주세요.", true);
  if (text.length > MAX_INPUT_CHARS) {
    return toolText(`한 번에 ${MAX_INPUT_CHARS.toLocaleString()}자까지 확인할 수 있습니다. 나눠서 보내주세요.`, true);
  }

  const usage = await usageInfo(key);
  if (usage.remaining <= 0) {
    return toolText("이번 달 호출 한도를 모두 사용했습니다. 한도 상향은 reamer@d-reamer.com으로 문의해주세요.", true);
  }

  const id = newVerificationId();
  // /v1과 같은 과금 방식 — 받아들이는 순간 행을 먼저 잡는다. 결과를 기다린 뒤에 세면
  // 그 사이에 들어온 요청이 전부 한도 확인을 통과한다.
  const usageId = await recordApiUsage(key.id, { verificationId: id, endpoint: "POST /mcp verify", statusCode: 202, billable: true });

  let done;
  try {
    ({ done } = await startVerification({
      id,
      text,
      source: "api",
      userId: null,
      apiKeyId: key.id,
      clientKey: `key:${key.id}`,
      dataConsent: !!key.data_sharing,
    }));
  } catch (e) {
    if (usageId) await finishApiUsage(usageId, { statusCode: 500, cached: false, billable: false });
    throw e;
  }

  await Promise.race([done.catch(() => null), new Promise((r) => setTimeout(r, WAIT_MS))]);
  const v = await getVerification(id);
  if (usageId) await finishApiUsage(usageId, { statusCode: v.status === "pending" ? 202 : 200, cached: !!v.from_cache });

  return finish(v, id);
}

/** 검증 한 건의 상태를 모델이 읽을 글로 바꾼다. 두 도구가 같은 문장을 쓰게 한 곳. */
function finish(v, id) {
  if (!v) return toolText("그 확인 번호를 찾을 수 없습니다.", true);
  if (v.status === "pending") {
    // 여기서 "링크를 보세요"로 끝내면 모델도 사용자도 할 수 있는 일이 없다.
    // 다시 부를 도구 이름을 분명히 말해 줘야 대화가 이어진다.
    return toolText(
      `아직 확인 중입니다. 확인 번호: ${id}\n` +
        `20~30초 뒤 get_verification_result를 이 번호로 다시 불러주세요.\n` +
        `사람이 직접 볼 주소: ${publicBase()}/r/${id}`,
    );
  }
  if (v.status !== "done") return toolText(`확인에 실패했습니다: ${v.error || "알 수 없는 오류"}`, true);
  return toolText(`${renderResult(v)}\n\n전체 결과: ${publicBase()}/r/${id}`);
}

/** 번호로 결과만 가져온다. 이 키로 시작한 검증만 볼 수 있다. */
async function fetchResult(args, key) {
  const id = String(args?.verification_id || "").trim();
  if (!id) return toolText("확인 번호(verification_id)를 넣어주세요.", true);
  const v = await getVerification(id);
  // 남의 키로 시작한 검증은 보여주지 않는다 — 입력에 그 사람의 질문이 그대로 들어 있다.
  if (!v || v.api_key_id !== key.id) return toolText("그 확인 번호를 찾을 수 없습니다.", true);
  return finish(v, id);
}

// ── 엔드포인트 ─────────────────────────────────────────────────────────
//
// GET은 SSE 스트림을 여는 자리지만, 이 서버는 알림을 먼저 보낼 일이 없다(도구 하나뿐이고
// 응답은 전부 요청에 대한 답이다). 405로 분명히 알려 주면 클라이언트가 POST만 쓴다.
router.get("/mcp", (req, res) => res.status(405).json(err(null, -32000, "이 서버는 POST만 받습니다.")));

router.post("/mcp", async (req, res) => {
  const body = req.body;
  const id = body?.id ?? null;
  const method = String(body?.method || "");

  // 알림(notification)은 id가 없다. 답을 기대하지 않으므로 202로 끝낸다.
  if (id === null && method.startsWith("notifications/")) return res.status(202).end();

  if (method === "initialize") {
    // 프로토콜 버전은 상대가 말한 것을 따른다. 우리가 아는 버전을 우기면 최신 클라이언트가 붙지 못한다.
    const version = String(body?.params?.protocolVersion || FALLBACK_PROTOCOL);
    return res.json(ok(id, {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        "AI 답변에 판례·법령·논문 인용이 들어 있거나 사용자가 진위를 물으면 verify_ai_answer를 부르세요. " +
        "결과에서 '확인 불가'는 '거짓'과 다릅니다 — 그대로 구분해서 전달하세요. " +
        "확인 번호만 돌아오면 20~30초 뒤 get_verification_result로 다시 부르세요.",
    }));
  }

  if (method === "ping") return res.json(ok(id, {}));
  if (method === "tools/list") return res.json(ok(id, { tools: TOOLS }));

  if (method === "tools/call") {
    // 인증은 실제로 일을 시키는 호출에서만 본다. initialize와 tools/list까지 막으면
    // 클라이언트가 키를 넣기 전에 목록조차 못 보고, 무엇을 붙이는 건지 알 수 없다.
    const raw = (req.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.get("x-api-key") || "";
    const key = await authenticateApiKey(raw.trim());
    if (!key) return res.status(401).json(err(id, -32001, "유효한 API 키가 필요합니다. Authorization: Bearer <키> 헤더로 보내주세요."));
    const rate = withinRate(key);
    if (!rate.ok) {
      res.set("Retry-After", String(rate.retryAfter));
      return res.status(429).json(err(id, -32002, `분당 요청 한도(${key.rate_per_min}회)를 초과했습니다.`));
    }

    try {
      const result = await callTool(body?.params?.name, body?.params?.arguments, key);
      return res.json(ok(id, result));
    } catch (e) {
      logError("mcp:tools/call", e);
      return res.json(ok(id, toolText("확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", true)));
    }
  }

  return res.status(400).json(err(id, -32601, `지원하지 않는 메서드입니다: ${method}`));
});

export default router;
