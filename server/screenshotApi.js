// 캡처 업로드 → 글자 추출.
//
// 검증까지 여기서 하지 않는다. 캡처는 **입력을 만드는 단계**일 뿐이고, 뽑아낸 글은
// 화면의 입력칸에 그대로 들어간다. 사용자가 그걸 보고 고친 다음 평소처럼 검증을 누른다.
//
// 그렇게 나눈 이유가 있다. 캡처를 잘못 읽으면(글자가 흐리거나 잘렸거나) 엉뚱한 문장이
// 검증되는데, 한 번에 이어 버리면 사용자는 무엇이 검증됐는지 모른 채 결과만 본다.
// 중간에 사람이 한 번 보게 하면 그 사고가 사라진다.
//
// **이미지는 저장하지 않는다.** 받아서 읽고 버린다. 캡처에는 대화 상대의 이름, 다른
// 탭, 알림 같은 것이 같이 찍히고 그건 검증에 필요하지 않다. 남는 것은 추출된 글뿐이고,
// 그마저도 사용자가 검증을 눌러야 기록된다.
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { clientIp, createLimiter, limitMiddleware } from "./security.js";
import { readScreenshot } from "./claude.js";
import { checkAndConsume } from "./usageStore.js";
import { logError } from "./errorLog.js";
import { UpstreamError, userMessageFor } from "./upstream.js";

const router = patchAsync(express.Router());

// 한 장 5MB, 최대 4장. 휴대폰 캡처 한 장이 보통 1~3MB다.
// 4장으로 끊은 이유는 긴 답변을 나눠 찍는 경우가 실제로 그 정도이고, 그보다 많으면
// 읽는 값이 검증 한 건 값을 넘어서기 때문이다.
export const MAX_IMAGES = 4;
export const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// 캡처 읽기는 검증보다 싸지만 공짜는 아니다. 넉넉하되 연타는 막는다.
const limiter = createLimiter({ windowMs: 60_000, max: 6 });
const dayLimiter = createLimiter({ windowMs: 24 * 3600 * 1000, max: 60 });

/** data URL이든 순수 base64든 받아서 { mediaType, data, bytes }로 만든다. */
function parseImage(raw) {
  const s = String(raw || "");
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(s);
  const mediaType = m ? m[1].toLowerCase() : "image/png";
  const data = (m ? m[2] : s).replace(/\s/g, "");
  if (!ALLOWED.has(mediaType)) return { error: "PNG · JPG · WEBP 이미지만 올릴 수 있어요." };
  if (!data) return { error: "이미지를 읽지 못했어요." };
  // base64는 원본의 약 4/3 크기다.
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > MAX_BYTES) return { error: "이미지 한 장은 5MB까지 올릴 수 있어요." };
  return { mediaType, data, bytes };
}

router.post(
  "/screenshot",
  limitMiddleware(limiter, (req) => `shot:${clientIp(req)}`),
  limitMiddleware(dayLimiter, (req) => `shot-day:${clientIp(req)}`, "오늘 캡처 읽기 한도에 도달했어요."),
  async (req, res) => {
    const raw = Array.isArray(req.body?.images) ? req.body.images : [req.body?.image].filter(Boolean);
    if (!raw.length) return res.status(400).json({ error: "이미지를 올려주세요." });
    if (raw.length > MAX_IMAGES) return res.status(400).json({ error: `캡처는 한 번에 ${MAX_IMAGES}장까지 읽을 수 있어요.` });

    const images = [];
    for (const one of raw) {
      const parsed = parseImage(one);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      images.push(parsed);
    }

    // 검증과 같은 지갑을 쓴다. 캡처를 읽는 것도 우리 돈이 나가는 일이고,
    // 여기만 공짜로 두면 크레딧을 쓰지 않고 API를 돌리는 길이 생긴다.
    const user = req.user;
    if (user && !user.identity_verified_at) {
      return res.status(403).json({ error: "휴대폰 본인확인을 마치면 바로 이용하실 수 있어요.", code: "IDENTITY_REQUIRED" });
    }
    // 캡처 한 장은 대략 2,000자 한 칸으로 친다 — 읽기 값이 그 정도다.
    const usage = await checkAndConsume({ user, ip: clientIp(req), chars: images.length * 2000 });
    if (!usage.allowed) {
      return res.status(402).json({ error: "오늘 남은 확인 횟수를 모두 사용했어요.", limitReached: true, loggedIn: !!user });
    }

    try {
      const text = await readScreenshot(images);
      if (!text) {
        return res.status(422).json({
          error: "캡처에서 AI 답변을 찾지 못했어요. 답변 부분이 잘 보이게 다시 찍어주세요.",
          code: "NO_TEXT",
        });
      }
      res.json({ text, images: images.length });
    } catch (e) {
      if (e instanceof UpstreamError) {
        logError(`screenshot:${e.code}`, e);
        return res.status(502).json({ error: userMessageFor(e.code), upstream: true });
      }
      logError("screenshot", e);
      res.status(502).json({ error: "캡처를 읽지 못했어요. 잠시 후 다시 시도해주세요." });
    }
  },
);

export default router;
