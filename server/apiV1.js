import crypto from "node:crypto";
import express from "express";
import { issueApiKey, validateApiKey, recordUsage, peekApiKeyUsage, API_DAILY_LIMIT } from "./apiKeys.js";
import { getResult, saveResult } from "./resultsStore.js";
import { getCached } from "./verifyCache.js";
import { runVerificationJob } from "./verifyPipeline.js";

// 유메 검증 엔진을 외부 서비스가 직접 호출할 수 있는 공개 API(/v1/*).
// 경연에서 수익모델(개발자 API·B2B)을 말로만 설명하지 않고 실제로 curl 한 줄로
// 시연하기 위한 것 — 그래서 키 발급도 즉시 데모로 나오게 했다. 실제 서비스로
// 넘어가면 /v1/keys는 회원가입/결제 뒤로 옮기고, apiKeys.js의 메모리 저장을
// DB로 바꾸면 된다.
//
// 카카오 채널과 마찬가지로 검증에 10~30초가 걸리므로, 응답을 계속 붙들고
// 기다리게 하지 않고 "id 즉시 반환 → 폴링" 패턴을 쓴다:
//   POST /v1/verify      → { id, status: "pending" | "done", ... }
//   GET  /v1/verify/:id  → 최신 상태 조회
const router = express.Router();

function requireApiKey(req, res, next) {
  const apiKey = req.get("x-api-key") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const record = validateApiKey(apiKey);
  if (!record) {
    return res.status(401).json({ error: "유효한 API 키가 필요해요. X-API-Key 헤더로 보내주세요. 키가 없다면 POST /v1/keys 로 데모 키를 발급받으세요." });
  }
  req.apiKey = apiKey;
  next();
}

// 데모 API 키 발급 — 실제 가입/결제 없음. IP당 발급 개수만 남용 방지용으로 제한한다.
router.post("/keys", (req, res) => {
  const label = req.body?.label;
  const { record, error } = issueApiKey(label, req.ip);
  if (error) return res.status(429).json({ error });
  res.status(201).json({
    apiKey: record.apiKey,
    label: record.label,
    dailyLimit: API_DAILY_LIMIT,
    note: "데모 키입니다 — 실제 결제 없이 즉시 발급되며, 서버 재배포 시 초기화될 수 있어요.",
  });
});

router.post("/verify", requireApiKey, (req, res) => {
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text 필드에 검증할 내용을 담아 보내주세요." });

  const usage = recordUsage(req.apiKey);
  if (!usage.allowed) {
    return res.status(429).json({
      error: `일일 호출 한도(${API_DAILY_LIMIT}회)를 초과했어요. 내일 다시 시도하거나 유메에 문의해 한도를 늘려주세요.`,
      dailyLimit: API_DAILY_LIMIT,
    });
  }

  const id = crypto.randomBytes(6).toString("hex");
  const source = `api:${peekApiKeyUsage(req.apiKey)?.label || "?"}`;
  const cached = getCached(text);
  if (cached) {
    saveResult(id, { input: text, status: "done", result: cached, source });
    return res.status(200).json({ id, status: "done", cached: true, result: cached, usage });
  }

  saveResult(id, { input: text, status: "pending", source });
  res.status(202).json({ id, status: "pending", pollUrl: `/v1/verify/${id}`, usage });
  runVerificationJob(id, text, source);
});

router.get("/verify/:id", requireApiKey, (req, res) => {
  const entry = getResult(req.params.id);
  if (!entry) return res.status(404).json({ error: "결과를 찾을 수 없어요. id가 잘못됐거나 만료됐을 수 있어요." });
  res.json({ id: req.params.id, status: entry.status, input: entry.input, result: entry.result || null });
});

router.get("/usage", requireApiKey, (req, res) => {
  res.json(peekApiKeyUsage(req.apiKey));
});

// 간단한 자체 문서 — 별도 문서 사이트 없이도 브라우저/curl로 바로 확인 가능하게.
router.get("/", (req, res) => {
  res.json({
    service: "유메 검증 API",
    version: "v1",
    auth: "모든 요청에 X-API-Key 헤더 필요 (POST /v1/keys 로 데모 키 발급)",
    endpoints: [
      { method: "POST", path: "/v1/keys", desc: "데모 API 키 발급", body: { label: "string (선택)" } },
      { method: "POST", path: "/v1/verify", desc: "텍스트 검증 요청", body: { text: "string" } },
      { method: "GET", path: "/v1/verify/:id", desc: "검증 결과 조회(폴링)" },
      { method: "GET", path: "/v1/usage", desc: "이 키의 오늘 호출량 조회" },
    ],
    dailyLimit: API_DAILY_LIMIT,
  });
});

export default router;
