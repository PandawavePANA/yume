import crypto from "node:crypto";

export const IS_PROD = process.env.NODE_ENV === "production";

export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function setCookie(res, name, value, { maxAgeSec, req } = {}) {
  const secure = IS_PROD || req?.secure;
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  res.append("Set-Cookie", parts.join("; "));
}

export function clearCookie(res, name, req) {
  setCookie(res, name, "", { maxAgeSec: 0, req });
}

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// 단일 인스턴스 기준의 고정 창(fixed window) 제한기. 여러 인스턴스로 늘리면
// Redis 같은 공유 저장소로 옮겨야 한다.
export function createLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const t = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }, Math.max(windowMs, 60_000)).unref();
  function check(key) {
    const t = Date.now();
    let e = hits.get(key);
    if (!e || e.resetAt <= t) {
      e = { count: 0, resetAt: t + windowMs };
      hits.set(key, e);
    }
    e.count += 1;
    return { allowed: e.count <= max, remaining: Math.max(0, max - e.count), retryAfterSec: Math.ceil((e.resetAt - t) / 1000) };
  }
  check.blocked = (key) => {
    const e = hits.get(key);
    return !!e && e.resetAt > Date.now() && e.count >= max;
  };
  return check;
}

export function limitMiddleware(limiter, keyFn, message = "요청이 너무 많아요. 잠시 후 다시 시도해주세요.") {
  return (req, res, next) => {
    const r = limiter(keyFn(req));
    if (!r.allowed) {
      res.set("Retry-After", String(r.retryAfterSec));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

export function securityHeaders(req, res, next) {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (IS_PROD) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

// 쿠키 세션을 쓰는 /api/* 상태 변경 요청은 같은 사이트에서 온 것만 받는다(CSRF 방어).
// SameSite=Lax 쿠키와 이중으로 막는 장치. 외부 서버가 부르는 카카오 웹훅은 제외.
const CSRF_EXEMPT = [/^\/api\/kakao\//];
export function sameOriginGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (CSRF_EXEMPT.some((re) => re.test(req.path))) return next();
  const origin = req.get("origin") || req.get("referer");
  if (!origin) return next(); // 브라우저가 아닌 클라이언트(쿠키 없음)는 어차피 세션이 없다
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: "잘못된 요청 출처예요." });
  }
  const allowed = new Set([req.get("host"), ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)]);
  if (process.env.PUBLIC_BASE_URL) {
    try {
      allowed.add(new URL(process.env.PUBLIC_BASE_URL).host);
    } catch {
      /* 무시 */
    }
  }
  if (!allowed.has(originHost)) return res.status(403).json({ error: "허용되지 않은 출처의 요청이에요." });
  next();
}

export function isEmail(s) {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

// 별도 도메인에 배포된 정적 사이트(기업용 소개, 리머 소개)에서 부르는 엔드포인트용 교차 출처 관문.
//
// **반드시 자기 경로에만 붙인다.** 이 미들웨어들은 전부 app.use("/api", ...)로 얹히므로
// router.use()로 달면 같은 /api 아래 다른 라우터의 프리플라이트까지 자기 허용목록으로
// 판단해 버린다. 먼저 얹힌 쪽이 남의 OPTIONS를 403으로 끊어도 브라우저는 본 요청을
// 보내지 않으니, 양식은 서버 로그에 아무것도 남기지 않고 조용히 실패한다.
// envNames는 앞에서부터 처음 값이 있는 것을 쓴다.
export function crossOriginGate(...envNames) {
  const read = () => {
    for (const name of envNames) {
      const v = process.env[name];
      if (v) return v;
    }
    return "";
  };
  // 목록은 호출 시점에 읽는다 — 모듈 로드 순서에 따라 환경변수가 아직 없을 수 있다.
  let cached = null;
  let cachedFrom = null;
  const allowed = () => {
    const raw = read();
    if (raw !== cachedFrom) {
      cachedFrom = raw;
      cached = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
    }
    return cached;
  };
  return function gate(req, res, next) {
    const origin = req.get("origin");
    const okOrigin = Boolean(origin) && allowed().has(origin);
    if (okOrigin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      // X-Thread-Token — 의뢰 스레드의 열쇠. URL에 실으면 접속 로그에 그대로 남아서
      // 헤더로 받는다. 헤더를 쓰는 순간 GET에도 프리플라이트가 붙으므로 GET도 함께 허용한다.
      res.set("Access-Control-Allow-Headers", "Content-Type, X-Thread-Token");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(okOrigin ? 204 : 403);
    next();
  };
}
