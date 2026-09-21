// 관리자 화면 비밀번호 잠금.
//
// 원래 관리자 판정은 두 가지뿐이었다: 유메 계정으로 로그인해 role=admin이거나,
// X-Admin-Key 헤더에 ADMIN_SECRET을 넣거나. 그런데 헤더는 브라우저 주소창으로
// 넣을 수 없어서, 사람이 그냥 주소를 열어 들어오는 길이 없었다. 여기가 그 길이다.
//
// 지키는 것들:
//  - 비밀번호는 환경변수(ADMIN_PASSWORD)에만 둔다. 저장소는 공개라 코드에 적으면
//    그 순간 비밀번호가 아니게 된다. 값이 없으면 잠금은 아예 열리지 않는다.
//  - 비교는 길이를 먼저 맞춘 뒤 timingSafeEqual로 한다. 문자열 ===는 앞에서부터
//    다른 곳이 나오면 바로 끝나서, 걸린 시간으로 몇 글자가 맞았는지가 새어 나간다.
//  - 통과하면 비밀번호 자체가 아니라 서명한 쿠키를 준다. 쿠키가 새도 비밀번호는
//    드러나지 않고, 서명이 있어 값을 지어낼 수 없다.
//  - 실패는 IP마다 세어서 막는다. 안 막으면 그냥 전부 대입해 볼 수 있다.
import crypto from "node:crypto";
import { setCookie, clearCookie, parseCookies, clientIp, createLimiter } from "./security.js";

const COOKIE = "yume_admin";
const TTL_MS = 12 * 60 * 60 * 1000;

const password = () => process.env.ADMIN_PASSWORD || "";
// 쿠키 서명 키. 따로 주지 않으면 비밀번호에서 파생한다 — 비밀번호를 바꾸면
// 기존 쿠키가 전부 무효가 되는데, 그게 맞는 동작이다.
const signingKey = () =>
  process.env.ADMIN_COOKIE_SECRET || crypto.createHash("sha256").update("gate:" + password()).digest("hex");

export function gateConfigured() {
  return password().length >= 8;
}

function sign(expiresAt) {
  const mac = crypto.createHmac("sha256", signingKey()).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${mac}`;
}

function valid(token) {
  if (!token || !gateConfigured()) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = sign(expiresAt);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hasAdminCookie(req) {
  return valid(parseCookies(req.get("cookie"))[COOKIE]);
}

// 비밀번호는 몇 번만 틀릴 수 있다. 창이 길어야 대입이 실질적으로 불가능해진다.
const loginLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });

export function adminLogin(req, res) {
  if (!gateConfigured()) {
    return res.status(503).json({ error: "관리자 비밀번호가 설정되지 않았어요." });
  }
  const gate = loginLimiter(`admin-login:${clientIp(req)}`);
  if (!gate.allowed) {
    res.set("Retry-After", String(gate.retryAfterSec));
    return res.status(429).json({ error: "시도가 너무 많아요. 잠시 후 다시 해주세요." });
  }
  const given = Buffer.from(String(req.body?.password ?? ""));
  const want = Buffer.from(password());
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) return res.status(401).json({ error: "비밀번호가 맞지 않아요." });

  setCookie(res, COOKIE, sign(Date.now() + TTL_MS), { maxAgeSec: TTL_MS / 1000, req });
  res.json({ ok: true });
}

export function adminLogout(req, res) {
  clearCookie(res, COOKIE, req);
  res.json({ ok: true });
}

// 비밀번호 화면. 잠금이 설정되지 않았으면 그 사실을 알려 준다 — 빈 화면을 주면
// 배포한 사람이 왜 안 되는지 알 길이 없다.
export function renderLoginPage(next = "/admin/studio") {
  const safeNext = /^\/admin(\/[\w-]+)*$/.test(next) ? next : "/admin/studio";
  const missing = !gateConfigured();
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>리머 관리자</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#07070b; color:#eceae4;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif; }
  form { width:min(340px, calc(100vw - 40px)); }
  h1 { font-size:15px; margin:0 0 6px; letter-spacing:.02em; }
  p { font-size:12.5px; color:rgba(236,234,228,.5); margin:0 0 18px; line-height:1.6; }
  input { width:100%; padding:12px 13px; border-radius:6px; border:1px solid rgba(236,234,228,.16);
          background:rgba(0,0,0,.3); color:inherit; font:inherit; font-size:15px; }
  input:focus { outline:none; border-color:#6d5ae0; box-shadow:0 0 0 3px rgba(109,90,224,.16); }
  button { width:100%; margin-top:10px; padding:12px; border-radius:6px; border:0; cursor:pointer;
           background:#eceae4; color:#07070b; font:inherit; font-size:14px; font-weight:600; }
  button:disabled { opacity:.55; cursor:progress; }
  .msg { margin-top:12px; font-size:12.5px; color:#e0745c; min-height:17px; }
</style></head>
<body>
<form id="f" autocomplete="off">
  <h1>리머 관리자</h1>
  <p>${missing ? "서버에 ADMIN_PASSWORD가 설정되지 않아 로그인할 수 없습니다." : "비밀번호를 입력하세요."}</p>
  <input id="p" type="password" name="password" placeholder="비밀번호" autocomplete="current-password" ${missing ? "disabled" : "autofocus"} />
  <button type="submit" ${missing ? "disabled" : ""}>들어가기</button>
  <div class="msg" id="m"></div>
</form>
<script>
document.getElementById("f").addEventListener("submit", async function (e) {
  e.preventDefault();
  var b = e.target.querySelector("button"), m = document.getElementById("m");
  b.disabled = true; m.textContent = "";
  try {
    var r = await fetch("/api/admin/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("p").value }),
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || "로그인에 실패했어요.");
    location.replace(${JSON.stringify(safeNext)});
  } catch (err) { m.textContent = err.message; b.disabled = false; }
});
</script>
</body></html>`;
}
