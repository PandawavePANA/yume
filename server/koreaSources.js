// 한국 공식 출처 지도 — 사실을 확인할 때 분야마다 먼저 볼 곳.
//
// 베리라인이 "한국의 모든 걸 똑바로 알아야" 한다(2026-10-16 대표). 웹 전체에서 찾으면 블로그·카페·
// 옛 기사가 공식 자료보다 먼저 걸리고, 그 글이 틀렸으면 베리라인도 틀린다. 그래서 분야를 먼저 가르고,
// 그 분야의 공식 기관 사이트에서만 찾아본 뒤, 거기서 결론이 안 나면 그때 웹 전체로 넓힌다.
//
// 도메인은 하위 도메인까지 포함된다(mfds.go.kr → nedrug.mfds.go.kr). 목록은 정부·공공기관·법정 기관
// 위주이고, 대학병원처럼 공공기관이 아니어도 그 분야 1차 자료를 내는 곳만 더했다.
export const FIELDS = {
  law: {
    label: "법령·판례",
    domains: ["law.go.kr", "moleg.go.kr", "scourt.go.kr", "ccourt.go.kr", "easylaw.go.kr", "klri.re.kr"],
  },
  medical: {
    label: "의료·의약·건강",
    domains: [
      "mfds.go.kr", // 식약처(의약품안전나라 nedrug 포함)
      "kdca.go.kr", // 질병관리청(국가건강정보포털 health.kdca.go.kr 포함)
      "mohw.go.kr", // 보건복지부
      "hira.or.kr", // 건강보험심사평가원
      "nhis.or.kr", // 국민건강보험공단
      "health.kr", // 약학정보원
      "kpanet.or.kr",
      "kma.org", // 대한의사협회
      "snuh.org", "amc.seoul.kr", "severance.healthcare", "samsunghospital.com", // 대학병원 건강정보
      "ncc.re.kr", // 국립암센터
    ],
  },
  economy: {
    label: "경제·금융",
    domains: ["bok.or.kr", "kosis.kr", "kostat.go.kr", "moef.go.kr", "fsc.go.kr", "fss.or.kr", "krx.co.kr", "kdi.re.kr", "kdic.or.kr", "kofia.or.kr", "korea.kr"],
  },
  tax: {
    label: "세금",
    domains: ["nts.go.kr", "hometax.go.kr", "moef.go.kr", "law.go.kr", "wetax.go.kr", "customs.go.kr"],
  },
  labor: {
    label: "노동·고용",
    domains: ["moel.go.kr", "minimumwage.go.kr", "ei.go.kr", "comwel.or.kr", "nlrc.go.kr", "work24.go.kr", "law.go.kr", "nps.or.kr"],
  },
  realestate: {
    label: "부동산·주거",
    domains: ["molit.go.kr", "rt.molit.go.kr", "reb.or.kr", "khug.or.kr", "lh.or.kr", "iros.go.kr", "myhome.go.kr", "law.go.kr"],
  },
  company: {
    label: "기업·공시",
    domains: ["dart.fss.or.kr", "kind.krx.co.kr", "krx.co.kr", "ftc.go.kr", "smes.go.kr"],
  },
  welfare: {
    label: "복지·행정·교육",
    domains: ["gov.kr", "bokjiro.go.kr", "mohw.go.kr", "korea.kr", "youthcenter.go.kr", "moe.go.kr", "kice.re.kr", "mois.go.kr", "nec.go.kr", "mofa.go.kr", "0404.go.kr"],
  },
  statistics: {
    label: "통계",
    domains: ["kosis.kr", "kostat.go.kr", "bok.or.kr", "index.go.kr"],
  },
};

export const FIELD_KEYS = Object.keys(FIELDS);

/** 확인할 주장들의 분야를 모아, 먼저 찾아볼 공식 도메인 목록을 만든다(중복 없이, 최대 limit개). */
export function officialDomainsFor(fields, limit = 30) {
  const out = [];
  for (const f of fields) for (const d of FIELDS[f]?.domains || []) if (!out.includes(d)) out.push(d);
  return out.slice(0, limit);
}

/** 이 주소가 공식 출처 지도에 있는 곳인가(하위 도메인 포함). */
export function isOfficialUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (/\.go\.kr$/.test(host)) return true;
  return FIELD_KEYS.some((f) => FIELDS[f].domains.some((d) => host === d || host.endsWith(`.${d}`)));
}
