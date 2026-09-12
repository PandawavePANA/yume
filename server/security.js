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
