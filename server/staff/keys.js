// 키 넣는 칸 — 대표가 Railway에 못 들어갈 때 AI 본사 '할 일' 안에서 키를 넣는다(2026-10-16 대표).
//
// 대표가 넣은 값은 채팅·기록·화면 어디에도 남기지 않는다. 두 갈래로 간다:
//   · 유메가 쓰는 키(포트원 V2 시크릿, 공공데이터 키) — 서버 비밀값으로 봉인(AES-256-GCM, threads.js sealToken)해
//     DB 설정에 두고, 서버가 켜질 때·저장할 때 process.env에 올린다.
//   · 무궁이 쓰는 키(유메 API 키, 소셜 로그인 키, 검색 소유 확인) — HTTPS로 무궁의 키 보관함(/api/admin/secrets)에
//     운영 토큰(MUGUNG_ADMIN_TOKEN)을 붙여 넘긴다. 무궁은 자기 암호 키로 다시 봉인해 저장하고 바로 쓴다.
// Railway에 같은 이름의 값이 있으면 Railway 값이 우선이라, 여기서는 넣지 않는다.
import { getSetting, setSetting } from "../auditDesk.js";
import { openToken, sealToken } from "../threads.js";

export const KEY_FIELDS = {
  mugung_keys: [{ name: "YUME_API_KEY", label: "유메 API 키", target: "mugung", ph: "yume_live_로 시작" }],
  portone_v2_secret: [{ name: "PORTONE_V2_API_SECRET", label: "포트원 V2 API 시크릿", target: "both", ph: "포트원 관리자 → 결제 연동 → V2 API" }],
  kakao_login: [
    { name: "KAKAO_REST_API_KEY", label: "REST API 키", target: "mugung" },
    { name: "KAKAO_CLIENT_SECRET", label: "Client Secret(선택)", target: "mugung" },
  ],
  naver_login: [
    { name: "NAVER_CLIENT_ID", label: "Client ID", target: "mugung" },
    { name: "NAVER_CLIENT_SECRET", label: "Client Secret", target: "mugung" },
  ],
  google_login: [
    { name: "GOOGLE_CLIENT_ID", label: "클라이언트 ID", target: "mugung", ph: "….apps.googleusercontent.com" },
    { name: "GOOGLE_CLIENT_SECRET", label: "클라이언트 보안 비밀번호", target: "mugung" },
  ],
  instagram_login: [
    { name: "INSTAGRAM_CLIENT_ID", label: "Instagram 앱 ID", target: "mugung" },
    { name: "INSTAGRAM_CLIENT_SECRET", label: "Instagram 앱 시크릿", target: "mugung" },
  ],
  mugung_search: [
    { name: "NAVER_SITE_VERIFICATION", label: "네이버 소유 확인 값", target: "mugung", ph: "content=\"…\" 안의 값만" },
    { name: "GOOGLE_SITE_VERIFICATION", label: "구글 소유 확인 값", target: "mugung", ph: "content=\"…\" 안의 값만" },
  ],
  korea_data_keys: [
    { name: "ECOS_API_KEY", label: "한국은행 ECOS 인증키", target: "yume" },
    { name: "KOSIS_API_KEY", label: "KOSIS 인증키", target: "yume" },
    { name: "DATA_GO_KR_KEY", label: "공공데이터포털 인증키(Decoding)", target: "yume" },
    { name: "DART_API_KEY", label: "DART 인증키", target: "yume" },
  ],
};

const FIELDS = Object.values(KEY_FIELDS).flat();
const byName = (n) => FIELDS.find((f) => f.name === n);
const YUME_NAMES = FIELDS.filter((f) => f.target !== "mugung").map((f) => f.name);
const fromRailway = new Set(YUME_NAMES.filter((n) => process.env[n]));
const settingKey = (n) => `secret:${n}`;

/** 서버가 켜질 때 — 봉인해 둔 유메 키를 환경에 올린다. */
export async function loadYumeKeys() {
  let n = 0;
  for (const name of YUME_NAMES) {
    if (fromRailway.has(name)) continue;
    const sealed = await getSetting(settingKey(name)).catch(() => null);
    const v = sealed ? openToken(sealed) : null;
    if (v) {
      process.env[name] = v;
      n += 1;
    }
  }
  return n;
}

const mugungBase = () => (process.env.MUGUNG_URL || "https://xn--of0bu3x.com").replace(/\/+$/, "");
async function mugung(path, body, fetchImpl) {
  const token = process.env.MUGUNG_ADMIN_TOKEN || "";
  if (!token) throw new Error("무궁 연결 값(MUGUNG_ADMIN_TOKEN)이 유메 서버에 없어요.");
  const r = await fetchImpl(`${mugungBase()}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-admin-token": token },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `무궁 서버 응답 ${r.status}`);
  return d;
}

/** 포트원 V2 시크릿은 저장 전에 실제로 인증되는지 본다(없는 결제 번호를 조회 → 404면 인증 성공, 401이면 틀린 값). */
async function testPortone(secret, fetchImpl) {
  const r = await fetchImpl("https://api.portone.io/payments/key-check-not-exist", { headers: { Authorization: `PortOne ${secret}` }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 401 || r.status === 403) return "포트원이 이 값을 받아 주지 않았어요(인증 실패). V2 API 탭의 시크릿인지 확인해 주세요.";
  return null;
}

export async function saveKey(name, value, { fetchImpl = fetch } = {}) {
  const f = byName(String(name || ""));
  if (!f) return { error: "넣을 수 없는 키 이름이에요." };
  const v = String(value ?? "").trim();
  if (v.length < 4) return { error: "값이 너무 짧아요." };
  if (v.length > 4000) return { error: "값이 너무 길어요." };
  if (/\s/.test(v)) return { error: "값에 띄어쓰기·줄바꿈이 섞여 있어요. 앞뒤 공백 없이 그대로 붙여 넣어 주세요." };
  if (f.name === "PORTONE_V2_API_SECRET") {
    const bad = await testPortone(v, fetchImpl).catch(() => null);
    if (bad) return { error: bad };
  }
  if (f.target !== "mugung") {
    if (fromRailway.has(f.name)) return { error: `Railway 유메 서비스에 ${f.name}이(가) 이미 있어요. Railway 값이 우선이에요.` };
    const sealed = sealToken(v);
    if (!sealed) return { error: "서버 비밀값이 없어 암호화할 수 없어요." };
    await setSetting(settingKey(f.name), sealed);
    process.env[f.name] = v;
  }
  if (f.target !== "yume") {
    try {
      await mugung("/api/admin/secrets", { name: f.name, value: v }, fetchImpl);
    } catch (e) {
      return { error: `무궁에 넘기지 못했어요 — ${e.message}` };
    }
  }
  cache = null;
  return { ok: true, name: f.name };
}

/** 칸별로 넣었는지(값은 내보내지 않는다). 무궁 쪽은 무궁에 물어본다(실패하면 모름). */
let cache = null;
export async function keyStatus({ fetchImpl = fetch, fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.value;
  let remote = null;
  try {
    remote = (await mugung("/api/admin/secrets", null, fetchImpl)).secrets;
  } catch {
    remote = null;
  }
  const out = {};
  for (const f of FIELDS) {
    if (f.target === "mugung") out[f.name] = remote ? !!remote[f.name]?.set : null;
    else out[f.name] = !!process.env[f.name];
  }
  cache = { at: Date.now(), value: out };
  return out;
}
