// 응답 문구를 사용자의 언어로 바꿔 내보낸다.
//
// 호출부는 건드리지 않는다. error: "..."를 쓰는 자리가 100곳이 넘는데, 거기마다
// 코드를 붙이면 하나 빠뜨리는 순간 그 자리만 조용히 한국어로 남는다. 나가는 문을
// 하나만 지키면 빠뜨릴 자리가 없다.
//
// **번역하는 것은 error와 message, 그것도 맨 위 한 겹뿐이다.** 응답 안에는 사용자가
// 쓴 글과 검증 결과가 들어 있고, 그걸 사전으로 훑으면 언젠가 남의 문장을 멋대로
// 바꾼다. 안쪽으로는 들어가지 않는다.
import EN from "./messages.en.js";

const DICTS = { en: EN };
// 이 두 자리만 사람에게 읽히는 문장이다. data·body·text 같은 것은 내용이라 건드리지 않는다.
const FIELDS = ["error", "message"];

/**
 * 이 요청을 어느 언어로 답할지.
 *
 * 화면에서 고른 언어가 먼저다(X-Yume-Lang). 브라우저 설정(Accept-Language)은 그
 * 다음인데, 한국에서 영어로 쓰는 사람과 해외에서 한국어로 쓰는 사람이 둘 다 있어서
 * 브라우저 설정만 믿으면 본인이 고른 것과 어긋난다.
 *
 * 모르면 한국어다. 지금 쓰는 사람 대부분이 한국어를 읽고, 서버 로그와 운영자 화면도
 * 한국어 기준이다.
 */
export function pickLang(req) {
  const explicit = String(req.get?.("x-yume-lang") || "").trim().toLowerCase();
  if (DICTS[explicit]) return explicit;
  if (explicit === "ko") return "ko";

  const header = String(req.get?.("accept-language") || "");
  // "en-US,en;q=0.9,ko;q=0.8" — 앞에서부터 보고 아는 언어가 나오면 그것으로 정한다.
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) continue;
    if (tag.startsWith("ko")) return "ko";
    const base = tag.split("-")[0];
    if (DICTS[base]) return base;
  }
  return "ko";
}

/** 사전에 없으면 한국어 그대로. 빈 칸보다 한국어가 낫다. */
export function translate(text, lang) {
  const dict = DICTS[lang];
  if (!dict || typeof text !== "string") return text;
  const hit = dict[text];
  return hit === undefined ? text : hit;
}

/** res.json이 나가기 직전에 문구만 바꿔치운다. */
export function localizeResponses(req, res, next) {
  const lang = pickLang(req);
  // 한국어면 아무것도 감싸지 않는다 — 대부분의 요청에서 일을 하나도 늘리지 않는다.
  if (lang === "ko") return next();

  const send = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const f of FIELDS) {
        if (typeof body[f] === "string") body[f] = translate(body[f], lang);
      }
    }
    return send(body);
  };
  next();
}
