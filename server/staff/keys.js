// 키 넣는 칸 — 대표가 Railway에 못 들어갈 때 AI 본사 '할 일' 안에서 키를 넣는다(2026-10-16 대표).
//
// 대표가 넣은 값은 채팅·기록·화면 어디에도 남기지 않는다. 두 갈래로 간다:
//   · 유메가 쓰는 키(포트원 V2 시크릿, 공공데이터 키) — 서버 비밀값으로 봉인(AES-256-GCM, threads.js sealToken)해
//     DB 설정에 두고, 서버가 켜질 때·저장할 때 process.env에 올린다.
//   · 미르미가 쓰는 키(유메 API 키, 소셜 로그인 키, 검색 소유 확인) — HTTPS로 미르미의 키 보관함(/api/admin/secrets)에
//     운영 토큰(MUGUNG_ADMIN_TOKEN)을 붙여 넘긴다. 미르미는 자기 암호 키로 다시 봉인해 저장하고 바로 쓴다.
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
    { name: "DATA_GO_KR_KEY", label: "공공데이터포털 인증키(Decoding)", target: "both" },
    { name: "DART_API_KEY", label: "DART 인증키", target: "yume" },
  ],
  // 10-20 대표 "미르미 관련 내가 할 일 다 추가하고 입력할 게 있으면 할 일에서 다 입력 가능하게"
  // vaultOnly: 미르미 Railway 에 테스트 값이 이미 있어 '들어 있음'만으로는 끝난 게 아니다 — 보관함에 넣은 값이 있어야 넣음으로 본다.
  // 10-21 포트원 등록이 막혀 KG이니시스에 직접 연결 — 이 세 값을 넣으면 미르미 결제가 이니시스 실결제로 바뀐다
  inicis_direct: [
    { name: "INICIS_MID", label: "이니시스 상점 아이디(MID)", target: "mugung", ph: "영문 · 숫자 10자", vaultOnly: true },
    { name: "INICIS_SIGN_KEY", label: "웹결제 Sign Key", target: "mugung", ph: "가맹점 관리자 → 상점정보 → 계약정보 → 부가정보 → 웹결제 Sign Key '조회'", vaultOnly: true, secret: true },
    { name: "INICIS_MOBILE_HASHKEY", label: "모바일 금액위변조 Hash Key(있으면)", target: "mugung", ph: "같은 화면 '모바일 금액위변조 Hash Key' 조회", vaultOnly: true, secret: true },
  ],
  portone_live_channel: [{ name: "PORTONE_CHANNEL_KEY", label: "포트원 실연동 채널 키", target: "mugung", ph: "channel-key-로 시작", vaultOnly: true }],
  mirmi_openai: [{ name: "OPENAI_API_KEY", label: "OpenAI API 키", target: "mugung", ph: "sk-로 시작" }],
  mirmi_open_meteo: [{ name: "OPEN_METEO_KEY", label: "Open-Meteo API 키", target: "mugung" }],
  mirmi_play_console: [{ name: "ANDROID_CERT_SHA256", label: "앱 서명 키 SHA-256 지문", target: "mugung", ph: "AB:CD:… (두 글자씩 콜론, 32칸)" }],
  // 관리자 홈 비밀번호 — Railway 에 못 들어가도 여기서 바꾼다(10-20 대화에 노출). 저장하면 지금 로그인은 풀리고 새 비밀번호로 다시 들어온다.
  // 10-23 Anthropic 키 교체(대표 "레일웨이 노출 때문에, 유메 할 일에 입력칸") — 유메 · 미르미 둘 다, Railway 값보다 우선
  anthropic_key_1023: [{ name: "ANTHROPIC_API_KEY", label: "새 Anthropic API 키", target: "both", vaultWins: true, secret: true, ph: "sk-ant-api03-로 시작(console.anthropic.com → API Keys)" }],
  rotate_admin_pw_1020: [{ name: "ADMIN_PASSWORD", label: "새 관리자 홈 비밀번호(12자 이상)", target: "yume", vaultWins: true, minLen: 12, secret: true }],
};

const FIELDS = Object.values(KEY_FIELDS).flat();
const byName = (n) => FIELDS.find((f) => f.name === n);
const YUME_NAMES = FIELDS.filter((f) => f.target !== "mugung").map((f) => f.name);
// vaultWins: Railway 에 값이 있어도 여기서 넣은 값이 이긴다(대표가 Railway 에 못 들어갈 때 바꿀 수 있게)
const fromRailway = new Set(YUME_NAMES.filter((n) => process.env[n] && !byName(n)?.vaultWins));
const settingKey = (n) => `secret:${n}`;
const vaultLoaded = new Set();

/** 서버가 켜질 때 — 봉인해 둔 유메 키를 환경에 올린다. */
export async function loadYumeKeys() {
  let n = 0;
  for (const name of YUME_NAMES) {
    if (fromRailway.has(name)) continue;
    const sealed = await getSetting(settingKey(name)).catch(() => null);
    const v = sealed ? openToken(sealed) : null;
    if (v) {
      process.env[name] = v;
      vaultLoaded.add(name);
      n += 1;
    }
  }
  return n;
}

const mugungBase = () => (process.env.MUGUNG_URL || "https://xn--2w2b19bba.com").replace(/\/+$/, "");
async function mugung(path, body, fetchImpl) {
  const token = process.env.MUGUNG_ADMIN_TOKEN || "";
  if (!token) throw new Error("미르미 연결 값(MUGUNG_ADMIN_TOKEN)이 유메 서버에 없어요.");
  const r = await fetchImpl(`${mugungBase()}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-admin-token": token },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `미르미 서버 응답 ${r.status}`);
  return d;
}

/** 포트원 V2 시크릿은 저장 전에 실제로 인증되는지 본다(없는 결제 번호를 조회 → 404면 인증 성공, 401이면 틀린 값). */
async function testPortone(secret, fetchImpl) {
  const r = await fetchImpl("https://api.portone.io/payments/key-check-not-exist", { headers: { Authorization: `PortOne ${secret}` }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 401 || r.status === 403) return "포트원이 이 값을 받아 주지 않았어요(인증 실패). V2 API 탭의 시크릿인지 확인해 주세요.";
  return null;
}

/** Anthropic 키는 저장 전에 실제로 되는지 본다(모델 목록 조회 — 돈이 들지 않는다) */
async function testAnthropic(key, fetchImpl) {
  if (!key.startsWith("sk-ant-")) return "Anthropic 키는 sk-ant-로 시작해요.";
  const r = await fetchImpl("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 401 || r.status === 403) return "Anthropic이 이 키를 받아 주지 않았어요. console.anthropic.com → API Keys 에서 만든 sk-ant-api03- 키인지 확인해 주세요(Claude 앱 로그인 토큰은 쓸 수 없어요).";
  return null;
}

export async function saveKey(name, value, { fetchImpl = fetch } = {}) {
  const f = byName(String(name || ""));
  if (!f) return { error: "넣을 수 없는 키 이름이에요." };
  const v = String(value ?? "").trim();
  if (v.length < 4) return { error: "값이 너무 짧아요." };
  if (v.length > 4000) return { error: "값이 너무 길어요." };
  if (/\s/.test(v)) return { error: "값에 띄어쓰기·줄바꿈이 섞여 있어요. 앞뒤 공백 없이 그대로 붙여 넣어 주세요." };
  if (f.minLen && v.length < f.minLen) return { error: `${f.minLen}자 이상으로 넣어 주세요.` };
  if (f.name === "ANTHROPIC_API_KEY") {
    const bad = await testAnthropic(v, fetchImpl).catch(() => null);
    if (bad) return { error: bad };
  }
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
    vaultLoaded.add(f.name);
  }
  if (f.target !== "yume") {
    try {
      await mugung("/api/admin/secrets", { name: f.name, value: v }, fetchImpl);
    } catch (e) {
      return { error: `미르미에 넘기지 못했어요 — ${e.message}` };
    }
  }
  cache = null;
  return { ok: true, name: f.name };
}

/** 칸별로 넣었는지(값은 내보내지 않는다). 미르미 쪽은 미르미에 물어본다(실패하면 모름). */
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
    if (f.target === "mugung") out[f.name] = remote ? (f.vaultOnly ? remote[f.name]?.source === "vault" : !!remote[f.name]?.set) : null;
    else if (f.vaultWins) out[f.name] = !!vaultLoaded.has(f.name);
    else out[f.name] = !!process.env[f.name];
  }
  cache = { at: Date.now(), value: out };
  return out;
}
