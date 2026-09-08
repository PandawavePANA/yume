import express from "express";
import { requireAdmin } from "./adminAuth.js";
import { getUsageStats, listUsageEntries, FREE_DAILY_LIMIT, TOKEN_PRICE_KRW } from "./usageStore.js";
import { getChatStats, listChatUsers } from "./chatHistory.js";
import { getCacheStats } from "./verifyCache.js";
import { getResultsStats, listRecentResults } from "./resultsStore.js";
import { listApiKeys, API_DAILY_LIMIT } from "./apiKeys.js";
import { listErrors } from "./errorLog.js";

// 사이트 사용자·카카오 채널·API 키 현황을 한 번에 보여주는 내부 운영자용
// 엔드포인트. 전부 requireAdmin으로 막혀 있다 — 실제 로그인/DB가 없는
// 프로토타입이라 여기 모인 숫자가 서버 재시작 시 초기화되는 것도 동일하다.
const router = express.Router();
router.use(requireAdmin);

router.get("/stats", (req, res) => {
  res.json({
    generatedAt: Date.now(),
    website: { ...getUsageStats(), freeDailyLimit: FREE_DAILY_LIMIT, tokenPriceKrw: TOKEN_PRICE_KRW, top: listUsageEntries(50) },
    chats: { ...getChatStats(), list: listChatUsers(50) },
    cache: getCacheStats(30),
    results: { ...getResultsStats(), recent: listRecentResults(30) },
    apiKeys: { dailyLimit: API_DAILY_LIMIT, list: listApiKeys() },
    errors: listErrors(50),
  });
});

export default router;
