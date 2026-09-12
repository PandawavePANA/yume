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
    company: u.company,
    role: u.role,
    plan,
    planLabel: PLANS[plan].label,
    planExpiresAt: u.plan_expires_at || null,
    dataConsent: !!u.data_consent,
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

function baseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

const router = patchAsync(express.Router());

router.get("/auth/me", async (req, res) => {
  res.json({ user: publicUser(req.user), usage: await peekUsage({ user: req.user, ip: clientIp(req) }) });
});

router.post("/auth/signup", limitMiddleware(signupLimiter, (req) => `signup:${clientIp(req)}`), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = req.body?.password;
  const name = String(req.body?.name || "").trim().slice(0, 40);
  const { agreeTerms, agreePrivacy, dataConsent } = req.body || {};

  if (!isEmail(email)) return res.status(400).json({ error: "올바른 이메일 주소를 입력해주세요." });
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (!agreeTerms || !agreePrivacy) return res.status(400).json({ error: "필수 약관(이용약관·개인정보 수집·이용)에 동의해주세요." });
  if (await one("SELECT id FROM users WHERE email = :email", { email })) {
    return res.status(409).json({ error: "이미 가입된 이메일이에요. 로그인해주세요." });
  }

  const passwordHash = await hashPassword(password);
  const t = now();
  const role = ADMIN_EMAILS.has(email) ? "admin" : "user";
  let user;
  try {
    const r = await run(
      `INSERT INTO users (email, password_hash, name, role, data_consent, data_consent_at, terms_agreed_at, privacy_agreed_at, created_at, last_login_at)
       VALUES (:email, :ph, :name, :role, :dc, :dcAt, :t, :t, :t, :t) RETURNING *`,
      { email, ph: passwordHash, name, role, dc: dataConsent ? 1 : 0, dcAt: dataConsent ? t : null, t },
    );
    user = r.rows[0];
  } catch (e) {
    // 같은 이메일로 동시에 가입 요청이 들어온 경우(유니크 제약 위반)
    if (e.code === "23505") return res.status(409).json({ error: "이미 가입된 이메일이에요. 로그인해주세요." });
    throw e;
  }
  const userId = user.id;
  await audit(`user:${userId}`, "signup", `user:${userId}`, { dataConsent: !!dataConsent }, clientIp(req));
  await createSession(res, req, userId);
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
  await tx(async (t) => {
    await t.run("UPDATE users SET password_hash = :ph WHERE id = :id", { ph, id: row.user_id });
    await t.run("UPDATE password_resets SET used_at = :t WHERE token_hash = :h", { t: now(), h: row.token_hash });
    await t.run("DELETE FROM sessions WHERE user_id = :id", { id: row.user_id });
  });
  await audit(`user:${row.user_id}`, "password_reset", `user:${row.user_id}`, null, clientIp(req));
  res.json({ ok: true });
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

router.post("/account/password", requireUser, async (req, res) => {
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
router.delete("/account", requireUser, async (req, res) => {
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
