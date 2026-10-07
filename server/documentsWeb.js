// 문서 검사 — 웹 화면(로그인한 기업 사용자)용.
//
// 개발자가 없는 회사의 실무자가 쓰는 길이다. 파일을 올리거나 붙여 넣으면 /v1/documents와
// 똑같이 처리한다(documents.js). 과금도 같은 지갑을 쓴다 — 계정의 API 한도.
// 개인 크레딧으로 받지 않는 이유는, 기업 계약(월 약정)이 API 한도로 잡히기 때문이다.
// 같은 회사가 API로 보내든 화면으로 올리든 같은 한도에서 빠져야 청구가 맞는다.
//
// 키가 하나도 없는 계정이면 "웹 문서 검사" 키를 하나 만들어 그 한도를 쓴다. 키 목록에
// 그대로 보이므로 숨은 지갑이 생기지 않는다.
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { one } from "./db.js";
import { createApiKey } from "./apiKeys.js";
import { documentInput, getDocumentView, listUserDocuments, startDocument } from "./documents.js";
import { FileTextError } from "./fileText.js";
import { normalizeReferences } from "./referenceCheck.js";
import { createLimiter, limitMiddleware } from "./security.js";

const router = patchAsync(express.Router());
const docJson = express.json({ limit: "16mb" });
const limiter = createLimiter({ windowMs: 60_000, max: 6 });
const WEB_KEY_LABEL = "웹 문서 검사";

// 계약으로 한도를 올린 키가 있으면 그 키, 없으면 아무 활성 키, 그것도 없으면 새로 만든다.
async function billingKey(user) {
  const pick = () =>
    one(
      `SELECT * FROM api_keys WHERE user_id = :u AND status = 'active' ORDER BY monthly_quota DESC, created_at ASC LIMIT 1`,
      { u: user.id },
    );
  const found = await pick();
  if (found) return found;
  const created = await createApiKey(user, WEB_KEY_LABEL);
  if (created.error) return null;
  return pick();
}

const needLogin = (req, res) => {
  if (req.user) return false;
  res.status(401).json({ error: "로그인이 필요해요." });
  return true;
};

router.post("/documents", limitMiddleware(limiter, (req) => `doc:${req.user?.id || req.ip}`), docJson, async (req, res) => {
  if (needLogin(req, res)) return;
  let input;
  try {
    input = await documentInput(req.body);
  } catch (e) {
    if (e instanceof FileTextError) return res.status(400).json({ error: e.message });
    throw e;
  }
  if (input.error) return res.status(400).json({ error: "검사할 글을 붙여 넣거나 파일을 올려 주세요." });
  const ctx = normalizeReferences(req.body?.references, req.body?.organization);
  if (ctx.error) return res.status(400).json({ error: ctx.error });

  const key = await billingKey(req.user);
  if (!key) return res.status(409).json({ error: "API 키를 더 만들 수 없어 문서 검사를 시작하지 못했어요. 쓰지 않는 키를 하나 폐기해 주세요." });

  const started = await startDocument({
    key, text: input.text, title: input.title, refs: ctx.refs, organization: ctx.organization,
    endpoint: "POST /api/documents", source: "web", userId: req.user.id,
  });
  if (started.error) {
    const { status, code, message, extra } = started.error;
    return res.status(status).json({
      error: code === "quota_exceeded" ? `${message} 한도는 기업용 요금제에서 올릴 수 있어요.` : message,
      code,
      ...(extra || {}),
    });
  }
  res.status(202).json({ id: started.id, parts: started.chunks });
});

router.get("/documents", async (req, res) => {
  if (needLogin(req, res)) return;
  res.json({ documents: await listUserDocuments(req.user.id) });
});

router.get("/documents/:id", async (req, res) => {
  if (needLogin(req, res)) return;
  const got = await getDocumentView(String(req.params.id));
  if (!got || Number(got.doc.user_id) !== Number(req.user.id)) return res.status(404).json({ error: "문서를 찾을 수 없어요." });
  res.json(got.view);
});

export default router;
