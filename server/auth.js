import crypto from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import { patchAsync } from "./asyncExpress.js";
import { all, now, one, run, tx } from "./db.js";
import {
  sha256,
  randomToken,
  parseCookies,
  setCookie,
  clearCookie,
  clientIp,
  createLimiter,
  limitMiddleware,
  isEmail,
} from "./security.js";
import { sendMail } from "./mailer.js";
import { audit } from "./audit.js";
import { effectivePlan, PLANS, peekUsage } from "./usageStore.js";
import { logError } from "./errorLog.js";
import { attachReferral } from "./referral.js";
import { nicknameProblem, nicknameTaken } from "./contribution.js";
import { confirmIdentity, identityConfigured, IDENTITY_CHANNEL_KEY, STORE_ID } from "./portone.js";

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "yume_sid";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return crypto.timingSafeEqual(expected, actual);
}

// 존재하지 않는 이메일로 로그인할 때도 같은 시간이 걸리게 해서, 응답 시간으로 가입
// 여부를 알아내지 못하게 한다.
const DUMMY_HASH = await hashPassword(randomToken(12));

export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "비밀번호는 8자 이상이어야 해요.";
  if (pw.length > 128) return "비밀번호가 너무 길어요.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "비밀번호에 영문과 숫자를 모두 포함해주세요.";
  return null;
}

export function publicUser(u) {
  if (!u) return null;
  const plan = effectivePlan(u);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    nickname: u.display_name || null,
    company: u.company,
    role: u.role,
    plan,
    planLabel: PLANS[plan].label,
    planExpiresAt: u.plan_expires_at || null,
    dataConsent: !!u.data_consent,
    // 가입 뒤 휴대폰 본인확인을 마쳤는지. 화면이 첫 로딩에 바로 알아야 인증 창을 띄울지
    // 판단할 수 있다(검증을 눌러 403을 받고 나서야 아는 건 한 박자 늦다).
    identityVerified: !!u.identity_verified_at,
    identityAgreed: !!u.identity_agreed_at,
    createdAt: u.created_at,
  };
}

async function createSession(res, req, userId) {
  const token = randomToken(32);
  const t = now();
  await run(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (:id, :uid, :t, :exp, :t, :ip, :ua)`,
    { id: sha256(token), uid: userId, t, exp: t + SESSION_TTL_MS, ip: clientIp(req), ua: (req.get("user-agent") || "").slice(0, 300) },
  );
  setCookie(res, SESSION_COOKIE, token, { maxAgeSec: SESSION_TTL_MS / 1000, req });
}

// 모든 /api 요청에 붙는다. 세션이 유효하면 req.user(DB 행)를 채운다.
export async function attachUser(req, res, next) {
  req.user = null;
  const token = parseCookies(req.get("cookie"))[SESSION_COOKIE];
  if (!token) return next();
  const sid = sha256(token);
  const row = await one(
    `SELECT s.id AS sid, s.expires_at, s.last_seen_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = :sid`,
    { sid },
  );
  const t = now();
  if (!row || row.expires_at < t || row.status !== "active") {
    if (row) await run("DELETE FROM sessions WHERE id = :sid", { sid });
    clearCookie(res, SESSION_COOKIE, req);
    return next();
  }
  // 활동 중인 세션은 자동 연장(슬라이딩). DB 쓰기를 줄이려고 5분에 한 번만.
  if (t - row.last_seen_at > 5 * 60 * 1000) {
    await run("UPDATE sessions SET last_seen_at = :t, expires_at = :exp WHERE id = :sid", { t, exp: t + SESSION_TTL_MS, sid });
  }
  const { sid: _sid, expires_at: _e, last_seen_at: _l, ...user } = row;
  req.user = user;
  req.sessionId = sid;
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "로그인이 필요해요." });
  next();
}

export function requireAdminUser(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "관리자만 접근할 수 있어요." });
}

const loginLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const loginFailLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 6 });
const signupLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const resetLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
// 로그인된 세션에서 현재 비밀번호를 확인하는 곳(비밀번호 변경·탈퇴). 세션을 탈취당했을 때
// 여기서 비밀번호를 무한정 대입해 볼 수 없게 막는다.
const passwordCheckLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const passwordCheckLimit = limitMiddleware(passwordCheckLimiter, (req) => `pwcheck:${req.user?.id ?? clientIp(req)}`);

// 비밀번호 재설정 메일에 들어가는 주소다. 요청이 들어온 호스트를 그대로 쓰면 배포
// 플랫폼의 내부 도메인이나 www 없는 주소가 메일에 박힌다 — 메일은 고쳐 보낼 수 없다.
// PUBLIC_BASE_URL을 반드시 설정하되, 빠뜨린 배포에서도 운영 도메인이 나가게 해 둔다.
function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = String(req.get("host") || "");
  if (/^localhost|^127\.|^\[::1\]|^0\.0\.0\.0/.test(host)) return `${req.protocol}://${host}`;
  return "https://www.yume-reamer.com";
}

const router = patchAsync(express.Router());

router.get("/auth/me", async (req, res) => {
  res.json({ user: publicUser(req.user), usage: await peekUsage({ user: req.user, ip: clientIp(req) }) });
});

router.post("/auth/signup", limitMiddleware(signupLimiter, (req) => `signup:${clientIp(req)}`), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password;
  const name = String(req.body?.name || "").trim().slice(0, 40);
  const nickname = String(req.body?.nickname || "").trim();
  const { agreeTerms, agreePrivacy, agreeIdentity, dataConsent } = req.body || {};

  if (!isEmail(email)) return res.status(400).json({ error: "올바른 이메일 주소를 입력해주세요." });
  // 닉네임은 랭킹에 그대로 나가는 이름이라 가입할 때 정하고, 겹칠 수 없다.
  const nickErr = nicknameProblem(nickname);
  if (nickErr) return res.status(400).json({ error: nickErr });
  if (await nicknameTaken(nickname)) return res.status(409).json({ error: "이미 쓰이고 있는 닉네임이에요. 다른 이름으로 지어주세요." });
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (!agreeTerms || !agreePrivacy) return res.status(400).json({ error: "필수 약관(이용약관·개인정보 수집·이용)에 동의해주세요." });
  if (!agreeIdentity) return res.status(400).json({ error: "본인확인 정보(CI) 수집·이용에 동의해주세요." });
  if (await one("SELECT id FROM users WHERE email = :email", { email })) {
    return res.status(409).json({ error: "이미 가입된 이메일이에요. 로그인해주세요." });
  }

  const passwordHash = await hashPassword(password);
  const t = now();
  const role = ADMIN_EMAILS.has(email) ? "admin" : "user";
  let user;
  try {
    const r = await run(
      `INSERT INTO users (email, password_hash, name, display_name, role, data_consent, data_consent_at, terms_agreed_at, privacy_agreed_at, identity_agreed_at, created_at, last_login_at)
       VALUES (:email, :ph, :name, :nickname, :role, :dc, :dcAt, :t, :t, :t, :t, :t) RETURNING *`,
      { email, ph: passwordHash, name, nickname, role, dc: dataConsent ? 1 : 0, dcAt: dataConsent ? t : null, t },
    );
    user = r.rows[0];
  } catch (e) {
    // 같은 이메일로 동시에 가입 요청이 들어온 경우(유니크 제약 위반)
    // 같은 이메일 또는 같은 닉네임으로 동시에 가입 요청이 들어온 경우(유니크 제약 위반).
    // 어느 쪽이 겹쳤는지 알려줘야 사용자가 무엇을 고쳐야 할지 안다.
    if (e.code === "23505") {
      const dupNickname = String(e.constraint || e.detail || "").includes("display_name");
      return res.status(409).json({
        error: dupNickname ? "이미 쓰이고 있는 닉네임이에요. 다른 이름으로 지어주세요." : "이미 가입된 이메일이에요. 로그인해주세요.",
      });
    }
    throw e;
  }
  const userId = user.id;
  await audit(`user:${userId}`, "signup", `user:${userId}`, { dataConsent: !!dataConsent }, clientIp(req));
  await createSession(res, req, userId);
  // 추천 코드로 들어온 가입이면 연결만 해둔다(크레딧은 이 사람이 첫 검증을 마칠 때).
  if (req.body?.referralCode) await attachReferral({ inviteeId: userId, code: req.body.referralCode, ip: clientIp(req) });
  res.status(201).json({ user: publicUser(user) });
});

router.post("/auth/login", limitMiddleware(loginLimiter, (req) => `login:${clientIp(req)}`), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const failKey = `fail:${email}`;
  const lockedMsg = "로그인 시도가 너무 많아요. 15분 뒤 다시 시도하거나 비밀번호를 재설정해주세요.";
  if (loginFailLimiter.blocked(failKey)) return res.status(429).json({ error: lockedMsg });
  const user = email ? await one("SELECT * FROM users WHERE email = :email", { email }) : null;
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) {
    loginFailLimiter(failKey);
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않아요." });
  }
  if (user.status !== "active") return res.status(403).json({ error: "이용이 정지된 계정이에요. reamer@d-reamer.com으로 문의해주세요." });
  const updates = { id: user.id, t: now() };
  if (ADMIN_EMAILS.has(user.email.toLowerCase()) && user.role !== "admin") {
    await run("UPDATE users SET role = 'admin' WHERE id = :id", { id: user.id });
    user.role = "admin";
  }
  await run("UPDATE users SET last_login_at = :t WHERE id = :id", updates);
  await createSession(res, req, user.id);
  res.json({ user: publicUser(user) });
});

router.post("/auth/logout", async (req, res) => {
  if (req.sessionId) await run("DELETE FROM sessions WHERE id = :sid", { sid: req.sessionId });
  clearCookie(res, SESSION_COOKIE, req);
  res.json({ ok: true });
});

router.post("/auth/forgot", limitMiddleware(resetLimiter, (req) => `reset:${clientIp(req)}`), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  // 가입 여부와 관계없이 같은 응답 — 이메일 존재 여부를 노출하지 않는다.
  res.json({ ok: true, message: "가입된 이메일이라면 비밀번호 재설정 링크를 보냈어요. 메일함을 확인해주세요." });
  const user = isEmail(email) ? await one("SELECT * FROM users WHERE email = :email AND status = 'active'", { email }) : null;
  if (!user) return;
  const token = randomToken(32);
  await run("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (:h, :uid, :t, :exp)", {
    h: sha256(token),
    uid: user.id,
    t: now(),
    exp: now() + RESET_TTL_MS,
  });
  const link = `${baseUrl(req)}/reset-password?token=${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: "[유메] 비밀번호 재설정 안내",
      text: `안녕하세요, 유메입니다.\n\n아래 링크에서 1시간 안에 새 비밀번호를 설정해주세요.\n${link}\n\n본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.`,
      html: `<p>안녕하세요, 유메입니다.</p><p>아래 버튼을 눌러 1시간 안에 새 비밀번호를 설정해주세요.</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#6B4FA8;color:#fff;text-decoration:none;font-weight:600">비밀번호 재설정</a></p><p style="color:#888;font-size:12px">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>`,
    });
  } catch (e) {
    logError("auth:forgot", e);
  }
});

router.post("/auth/reset", limitMiddleware(resetLimiter, (req) => `reset-do:${clientIp(req)}`), async (req, res) => {
  const token = String(req.body?.token || "");
  const password = req.body?.password;
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const row = token ? await one("SELECT * FROM password_resets WHERE token_hash = :h", { h: sha256(token) }) : null;
  if (!row || row.used_at || row.expires_at < now()) {
    return res.status(400).json({ error: "재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해주세요." });
  }
  const ph = await hashPassword(password);
  // 같은 링크로 두 요청이 동시에 들어와도 한 번만 쓰이도록, 토큰 소진을 조건부 갱신으로 먼저 잡는다.
  const consumed = await tx(async (t) => {
    const u = await t.run("UPDATE password_resets SET used_at = :t WHERE token_hash = :h AND used_at IS NULL", { t: now(), h: row.token_hash });
    if (!u.changes) return false;
    await t.run("UPDATE users SET password_hash = :ph WHERE id = :id", { ph, id: row.user_id });
    await t.run("DELETE FROM sessions WHERE user_id = :id", { id: row.user_id });
    return true;
  });
  if (!consumed) return res.status(400).json({ error: "재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해주세요." });
  await audit(`user:${row.user_id}`, "password_reset", `user:${row.user_id}`, null, clientIp(req));
  res.json({ ok: true });
});

// ── 본인확인으로 비밀번호 재설정 ────────────────────────────────────────────
//
// 메일로 보내는 길은 메일함을 열 수 있어야 쓴다. 회사를 옮겨 그 주소가 죽었거나, 가입할 때
// 어느 주소를 썼는지 기억나지 않으면 그 길은 막혀 있다. 계정에 크레딧이 남아 있어도 못 들어간다.
//
// 그래서 두 번째 길을 둔다. 기준은 CI다 — 본인확인기관이 같은 사람에게 늘 같은 값을 주므로,
// 다시 인증해서 같은 해시가 나오면 그 계정의 주인이라는 뜻이다. 이메일을 몰라도 된다.
//
// **인증 번호만으로는 열리지 않게 한다.** 이 번호는 모바일에서 주소창을 타고 돌아오므로
// 방문 기록이나 리퍼러에 남을 수 있다. 번호를 주운 사람이 남의 계정을 여는 일이 없도록,
// 인증을 시작한 그 브라우저에만 쿠키를 쥐여 주고 확인할 때 둘이 맞는지 본다.
// 번호와 쿠키가 함께 있어야 열리므로, 주소만 새는 것으로는 부족하다.
const IDENTITY_RESET_COOKIE = "yume_pwr";
// 이메일 링크보다 짧게 둔다. 링크는 메일함에 남지만 이건 인증을 막 끝낸 화면에서 바로 쓴다.
const IDENTITY_RESET_TTL_MS = 10 * 60 * 1000;
// 본인확인은 창을 열 때마다 우리 돈이 나간다. 남의 명의로는 어차피 통과하지 못하므로,
// 여기서 막는 것은 도용이 아니라 비용이다.
const identityResetLimiter = createLimiter({ windowMs: 3600 * 1000, max: 6 });

// 어느 계정인지 본인은 알아보되, 어깨너머로 보는 사람에게 주소가 드러나지는 않을 만큼만 남긴다.
function maskEmail(email) {
  const [id, domain] = String(email || "").split("@");
  if (!domain) return "***";
  return `${id.slice(0, 2)}${"*".repeat(Math.max(2, id.length - 2))}@${domain}`;
}

router.post("/auth/identity-reset/start", limitMiddleware(identityResetLimiter, (req) => `pwr:${clientIp(req)}`), async (req, res) => {
  if (!identityConfigured()) {
    return res.status(503).json({ error: "본인확인이 아직 준비되지 않았어요. 이메일로 재설정해주세요." });
  }
  // 로그인 전이라 동의를 걸어 둘 계정이 없다. 그래서 이 자리에서 받고, 계정을 찾은 뒤 기록에 남긴다.
  if (req.body?.agree !== true) {
    return res.status(400).json({ error: "본인확인 정보(CI) 수집·이용에 동의해주세요.", code: "NEEDS_CONSENT" });
  }
  const id = `yume-pwr-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  setCookie(res, IDENTITY_RESET_COOKIE, id, { maxAgeSec: 900, req });
  res.json({ identityVerificationId: id, storeId: STORE_ID, channelKey: IDENTITY_CHANNEL_KEY });
});

router.post("/auth/identity-reset/confirm", limitMiddleware(identityResetLimiter, (req) => `pwr-c:${clientIp(req)}`), async (req, res) => {
  const id = String(req.body?.identityVerificationId || "");
  const held = parseCookies(req.get("cookie"))[IDENTITY_RESET_COOKIE] || "";
  if (!id || id !== held) {
    return res.status(400).json({ error: "본인확인 정보가 맞지 않아요. 처음부터 다시 시도해주세요." });
  }
  // 한 번 쓴 번호로 두 번 열리지 않게, 결과를 보기 전에 먼저 소진한다.
  clearCookie(res, IDENTITY_RESET_COOKIE, req);

  const r = await confirmIdentity(id);
  if (!r.ok) {
    logError("auth:identity-reset", new Error(`${r.code} :: ${r.message}`));
    return res.status(400).json({ error: r.message, code: r.code });
  }

  const users = await all(
    "SELECT id, email FROM users WHERE identity_ci_hash = :h AND status = 'active' ORDER BY id",
    { h: r.ciHash },
  );
  if (!users.length) {
    // 여기서는 "계정이 없다"고 알려도 된다. 본인확인을 통과한 사람에게 돌려주는 것은 그 사람
    // 자신에 대한 정보뿐이라, 이메일로 찾을 때와 달리 남의 가입 여부가 새지 않는다.
    return res.status(404).json({
      error: "본인확인은 끝났지만 이 명의로 본인확인을 마친 계정이 없어요. 가입은 했는데 본인확인 전이라면 이메일로 재설정해주세요.",
      code: "NO_ACCOUNT",
    });
  }

  // 같은 명의로 계정이 여럿이면 전부 돌려준다. 본인임이 증명된 이상 어느 쪽을 열지는 본인이 고른다.
  const accounts = [];
  for (const u of users) {
    const token = randomToken(32);
    await run("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (:h, :uid, :t, :exp)", {
      h: sha256(token), uid: u.id, t: now(), exp: now() + IDENTITY_RESET_TTL_MS,
    });
    await audit(`user:${u.id}`, "password_reset_identity", `user:${u.id}`, null, clientIp(req));
    accounts.push({ email: maskEmail(u.email), token });
  }
  res.json({ name: r.name || "", accounts });
});

router.patch("/account", requireUser, async (req, res) => {
  const u = req.user;
  const name = req.body?.name != null ? String(req.body.name).trim().slice(0, 40) : u.name;
  const company = req.body?.company != null ? String(req.body.company).trim().slice(0, 80) : u.company;
  let dc = u.data_consent;
  let dcAt = u.data_consent_at;
  if (typeof req.body?.dataConsent === "boolean" && req.body.dataConsent !== !!u.data_consent) {
    dc = req.body.dataConsent ? 1 : 0;
    dcAt = now();
    await audit(`user:${u.id}`, dc ? "data_consent_given" : "data_consent_withdrawn", `user:${u.id}`, null, clientIp(req));
  }
  await run("UPDATE users SET name = :name, company = :company, data_consent = :dc, data_consent_at = :dcAt WHERE id = :id", {
    name,
    company,
    dc,
    dcAt,
    id: u.id,
  });
  res.json({ user: publicUser(await one("SELECT * FROM users WHERE id = :id", { id: u.id })) });
});

router.post("/account/password", requireUser, passwordCheckLimit, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!(await verifyPassword(String(currentPassword || ""), req.user.password_hash))) {
    return res.status(400).json({ error: "현재 비밀번호가 올바르지 않아요." });
  }
  const pwErr = passwordProblem(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const ph = await hashPassword(newPassword);
  await tx(async (t) => {
    await t.run("UPDATE users SET password_hash = :ph WHERE id = :id", { ph, id: req.user.id });
    await t.run("DELETE FROM sessions WHERE user_id = :id AND id != :sid", { id: req.user.id, sid: req.sessionId });
  });
  await audit(`user:${req.user.id}`, "password_change", `user:${req.user.id}`, null, clientIp(req));
  res.json({ ok: true });
});

// 회원 탈퇴 — 개인정보보호법상 지체 없이 파기. 검증 원문·대화·API 키까지 전부 지운다.
router.delete("/account", requireUser, passwordCheckLimit, async (req, res) => {
  if (!(await verifyPassword(String(req.body?.password || ""), req.user.password_hash))) {
    return res.status(400).json({ error: "비밀번호가 올바르지 않아요." });
  }
  const id = req.user.id;
  await tx(async (t) => {
    await t.run("DELETE FROM verifications WHERE user_id = :id", { id });
    await t.run("DELETE FROM chat_messages WHERE user_id = :id", { id });
    await t.run("DELETE FROM wallets WHERE client_key = :k", { k: `user:${id}` });
    await t.run("DELETE FROM usage_daily WHERE client_key = :k", { k: `user:${id}` });
    await t.run("DELETE FROM users WHERE id = :id", { id });
  });
  await audit(`user:${id}`, "account_deleted", `user:${id}`, null, clientIp(req));
  clearCookie(res, SESSION_COOKIE, req);
  res.json({ ok: true });
});

export function listUserSessions(userId) {
  return all("SELECT created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = :id ORDER BY last_seen_at DESC", { id: userId });
}

export async function purgeExpiredAuth() {
  const t = now();
  await run("DELETE FROM sessions WHERE expires_at < :t", { t });
  await run("DELETE FROM password_resets WHERE expires_at < :t", { t: t - 24 * 3600 * 1000 });
}

export default router;
