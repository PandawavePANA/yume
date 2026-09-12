// 특허 「검색공간 완전성 기반 부존재 신뢰도 정량화」 — 식별자 형식 검증부(120).
// 식별자마다 네 가지 검사(체계 적합성·범위 적합성·시간 정합성·발급규칙 정합성)를
// 0~1로 정규화해 결합한 형식오류 지수 F를 만든다. 결합은 1 − Π(1 − fᵢ):
// 강한 오류 하나만 있어도 F가 높아지고, 약한 경고는 누적된다.

const CURRENT_YEAR = new Date().getFullYear();

export const CHECK_NAMES = {
  system: "체계 적합성",
  range: "범위 적합성",
  temporal: "시간 정합성",
  issuance: "발급규칙 정합성",
};

function check(name, score, note) {
  return { name, label: CHECK_NAMES[name], score: Math.max(0, Math.min(1, score)), note };
}

export function combineChecks(checks) {
  const f = 1 - checks.reduce((acc, c) => acc * (1 - c.score), 1);
  return Math.round(f * 1000) / 1000;
}

// ───────────────────────── 판례(사건번호) ─────────────────────────
// 법원 사건부호. level은 사건이 속하는 심급·기관으로, 검색공간(수록 범위) 결정에 쓴다.
// 목록에 없는 부호는 "드문 실재 부호"일 수도 있어 체계 적합성에서 절반만 감점한다.
const CASE_CODES = {
  supreme: ["다", "다카", "도", "두", "므", "후", "스", "마", "모", "그", "무", "수", "우", "추", "재다", "재도", "재두"],
  appellate: ["나", "노", "누", "르", "라", "로", "브"],
  patent: ["허"],
  district: [
    "가합", "가단", "가소", "고합", "고단", "고정", "고약", "구합", "구단", "드합", "드단", "느합", "느단",
    "카합", "카단", "카기", "타경", "하합", "하단", "하면", "회합", "회단", "개회", "개확",
  ],
  constitutional: ["헌가", "헌나", "헌다", "헌라", "헌마", "헌바", "헌사", "헌아"],
};
const CODE_LEVEL = new Map(Object.entries(CASE_CODES).flatMap(([level, codes]) => codes.map((c) => [c, level])));

// 기관·제도가 생긴 해보다 앞선 연도의 사건번호는 형식상 존재할 수 없다(시간 정합성).
// 헌법재판소 1988년 9월 설립 / 행정소송 3심제·행정법원·특허법원 1998년 3월 시행.
const CODE_SINCE = { 헌가: 1988, 헌나: 1988, 헌다: 1988, 헌라: 1988, 헌마: 1988, 헌바: 1988, 헌사: 1988, 헌아: 1988, 두: 1998, 구합: 1998, 구단: 1998, 허: 1998 };

const MAX_SERIAL_DIGITS = { supreme: 6, appellate: 6, patent: 6, district: 7, constitutional: 4 };

export const LEVEL_LABEL = {
  supreme: "대법원",
  appellate: "고등법원·지방법원 항소부",
  patent: "특허법원",
  district: "지방법원(1심)",
  constitutional: "헌법재판소",
};

export function parseCaseNumber(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^(대법원|헌법재판소|[가-힣]+(고등|지방|가정|행정|특허|회생)법원(\s*[가-힣]+지원)?)\s*/, "");
  s = s.split(/[,，]/)[0].replace(/\s+/g, "");
  const m = s.match(/^(\d{2}|\d{4})([가-힣]{1,3})(\d{1,9})$/);
  if (!m) return null;
  return { yearRaw: m[1], code: m[2], serialRaw: m[3] };
}

export function checkCaseNumber(raw, claimedCourt = "") {
  const parsed = parseCaseNumber(raw);
  if (!parsed) {
    return {
      type: "case",
      raw: String(raw || ""),
      canonical: String(raw || "").replace(/\s+/g, ""),
      level: null,
      checks: [check("system", 1, "‘연도+사건부호+일련번호’ 형식이 아닙니다.")],
      F: 1,
    };
  }
  const { yearRaw, code, serialRaw } = parsed;
  const checks = [];

  // 연도 — 1999년까지는 두 자리(97다…), 2000년부터 네 자리(2016다…)로 부여된다.
  let year;
  let canonicalYear = yearRaw;
  if (yearRaw.length === 2) {
    const yy = Number(yearRaw);
    if (yy >= 48) {
      year = 1900 + yy;
    } else {
      year = 2000 + yy;
      checks.push(check("system", 0.5, `2000년 이후 사건은 연도를 네 자리로 씁니다(‘${yearRaw}’ → ‘${year}’).`));
      canonicalYear = String(year);
    }
  } else {
    year = Number(yearRaw);
    if (year >= 1948 && year < 2000) {
      checks.push(check("system", 0.2, `1999년 이전 사건번호는 연도를 두 자리로 씁니다(‘${year}’ → ‘${yearRaw.slice(2)}’).`));
      canonicalYear = yearRaw.slice(2);
    }
  }
  if (year < 1948) checks.push(check("range", 1, `${year}년은 대한민국 법원 사건번호 체계 이전입니다.`));
  if (year > CURRENT_YEAR) checks.push(check("range", 1, `${year}년은 아직 오지 않은 연도입니다.`));

  const level = CODE_LEVEL.get(code) || null;
  if (!level) checks.push(check("system", 0.5, `‘${code}’는 알려진 사건부호가 아닙니다.`));

  const since = CODE_SINCE[code];
  if (since && year < since) {
    checks.push(check("temporal", 1, `‘${code}’ 사건은 ${since}년에 제도가 시작되어 ${year}년 사건번호가 존재할 수 없습니다.`));
  }

  if (/^0/.test(serialRaw)) checks.push(check("issuance", 0.9, "일련번호는 0으로 시작하지 않습니다."));
  const serial = Number(serialRaw);
  if (serial === 0) checks.push(check("range", 1, "일련번호 0은 부여되지 않습니다."));
  const maxDigits = MAX_SERIAL_DIGITS[level] || 7;
  if (String(serial).length > maxDigits) {
    checks.push(check("range", 0.9, `${LEVEL_LABEL[level] || "해당"} 사건의 일련번호는 ${maxDigits}자리를 넘지 않습니다.`));
  }

  // 인용된 법원과 사건부호의 심급이 어긋나면 발급 체계상 존재할 수 없는 조합이다.
  const court = String(claimedCourt || "");
  if (level && court) {
    const effectiveLevel = code === "누" && year < 1998 ? "supreme" : level;
    const saysSupreme = /대법원/.test(court);
    const saysConstitutional = /헌법재판소|헌재/.test(court);
    const saysOtherCourt = !saysSupreme && /법원/.test(court);
    if (saysSupreme && effectiveLevel !== "supreme") {
      checks.push(check("issuance", 0.8, `‘${code}’는 대법원 사건부호가 아닙니다(${LEVEL_LABEL[level]} 사건부호).`));
    } else if (saysConstitutional && effectiveLevel !== "constitutional") {
      checks.push(check("issuance", 0.9, `‘${code}’는 헌법재판소 사건부호가 아닙니다.`));
    } else if (saysOtherCourt && ["constitutional", "supreme"].includes(effectiveLevel)) {
      checks.push(check("issuance", 0.8, `‘${code}’는 ${LEVEL_LABEL[effectiveLevel]} 사건부호인데 ${court}로 인용되었습니다.`));
    } else if (/특허법원/.test(court) && code !== "허") {
      checks.push(check("issuance", 0.6, "특허법원 사건부호는 ‘허’입니다."));
    }
  }

  return {
    type: "case",
    raw: String(raw),
    canonical: `${canonicalYear}${code}${serial || serialRaw}`,
    year,
    code,
    serial,
    level: code === "누" && year < 1998 ? "supreme" : level,
    checks,
    F: combineChecks(checks),
  };
}

// ───────────────────────── 법령 ─────────────────────────
// 널리 쓰이는 법령 약칭. 공식 DB는 정식 명칭만 색인하므로 약칭은 먼저 풀어준다.
export const LAW_ALIASES = {
  아청법: "아동ㆍ청소년의 성보호에 관한 법률",
  정보통신망법: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
  정통망법: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
  개보법: "개인정보 보호법",
  개인정보법: "개인정보 보호법",
  근기법: "근로기준법",
  산안법: "산업안전보건법",
  중대재해법: "중대재해 처벌 등에 관한 법률",
  중처법: "중대재해 처벌 등에 관한 법률",
  도교법: "도로교통법",
  특가법: "특정범죄 가중처벌 등에 관한 법률",
  특경법: "특정경제범죄 가중처벌 등에 관한 법률",
  성폭력처벌법: "성폭력범죄의 처벌 등에 관한 특례법",
  성폭법: "성폭력범죄의 처벌 등에 관한 특례법",
  가정폭력처벌법: "가정폭력범죄의 처벌 등에 관한 특례법",
  주임법: "주택임대차보호법",
  상임법: "상가건물 임대차보호법",
  상가임대차법: "상가건물 임대차보호법",
  공정거래법: "독점규제 및 공정거래에 관한 법률",
  자본시장법: "자본시장과 금융투자업에 관한 법률",
  전금법: "전자금융거래법",
  전자상거래법: "전자상거래 등에서의 소비자보호에 관한 법률",
  하도급법: "하도급거래 공정화에 관한 법률",
  채무자회생법: "채무자 회생 및 파산에 관한 법률",
  민소법: "민사소송법",
  형소법: "형사소송법",
  민집법: "민사집행법",
  국보법: "국가보안법",
  정자법: "정치자금법",
  공선법: "공직선거법",
  김영란법: "부정청탁 및 금품등 수수의 금지에 관한 법률",
  청탁금지법: "부정청탁 및 금품등 수수의 금지에 관한 법률",
  스토킹처벌법: "스토킹범죄의 처벌 등에 관한 법률",
  교특법: "교통사고처리 특례법",
  학폭법: "학교폭력예방 및 대책에 관한 법률",
};

const LAW_SUFFIX = /(법|법률|령|규칙|규정|조례|헌법|협정|조약|고시|훈령|예규|지침|기준|요령|강령)$/;

export function normalizeLawName(name) {
  return String(name || "").replace(/[\s·ㆍ・.,]/g, "");
}

export function resolveLawAlias(name) {
  const trimmed = String(name || "").trim();
  return LAW_ALIASES[normalizeLawName(trimmed)] || null;
}

export function parseArticle(raw) {
  const m = String(raw || "").replace(/\s+/g, "").match(/^제?(\d+)조(?:의(\d+))?/);
  if (!m) return null;
  return { no: Number(m[1]), branch: m[2] ? Number(m[2]) : null };
}

// 법령명은 약칭·띄어쓰기 변형이 흔해 여기서는 가볍게만 본다. 조문 번호가 해당 법령의
// 실제 최대 조문 번호를 넘는지는 법령 본문을 받아온 뒤 checkArticleAgainstLaw에서 본다.
export function checkStatute(lawName, article) {
  const checks = [];
  const name = String(lawName || "").trim();
  const norm = normalizeLawName(name);
  if (!norm) checks.push(check("system", 1, "법령명이 비어 있습니다."));
  else if (!LAW_SUFFIX.test(norm)) checks.push(check("system", 0.3, "법령명이 ‘…법·…령·…규칙’ 같은 법령 명칭 형식이 아닙니다."));
  if (/[A-Za-z]/.test(norm)) checks.push(check("system", 0.3, "법령명에 로마자가 섞여 있습니다."));

  const art = article ? parseArticle(article) : null;
  if (article && !art) checks.push(check("system", 0.4, `조문 표기 ‘${article}’를 해석할 수 없습니다.`));
  if (art && art.no === 0) checks.push(check("range", 1, "제0조는 존재하지 않습니다."));
  if (art && art.no > 1500) checks.push(check("range", 1, `제${art.no}조까지 있는 법령은 없습니다.`));

  return {
    type: "statute",
    raw: [name, article].filter(Boolean).join(" "),
    canonical: art ? `${name} 제${art.no}조${art.branch ? `의${art.branch}` : ""}` : name,
    lawName: name,
    article: art,
    looksAbbreviated: norm.length <= 5 && /법$/.test(norm),
    checks,
    F: combineChecks(checks),
  };
}

export function checkArticleAgainstLaw(base, maxArticleNo) {
  if (!base.article || !maxArticleNo) return base;
  if (base.article.no > maxArticleNo) {
    const checks = [...base.checks, check("range", 0.9, `이 법령의 마지막 조문은 제${maxArticleNo}조입니다.`)];
    return { ...base, checks, F: combineChecks(checks) };
  }
  return base;
}

// ───────────────────────── 학술·서지 식별자 ─────────────────────────
export function checkDoi(raw) {
  const s = String(raw || "").trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "").replace(/[.,;)\]]+$/, "");
  const checks = [];
  if (!/^10\.\d{4,9}\/\S+$/.test(s)) checks.push(check("system", 1, "DOI는 ‘10.접두번호/접미어’ 형식이어야 합니다."));
  return { type: "doi", raw: String(raw), canonical: s.toLowerCase(), checks, F: combineChecks(checks) };
}

export function checkArxiv(raw) {
  const s = String(raw || "").trim().replace(/^(arxiv:\s*|https?:\/\/arxiv\.org\/(abs|pdf)\/)/i, "").replace(/\.pdf$/i, "");
  const checks = [];
  const nowYY = CURRENT_YEAR % 100;
  const nowMonth = new Date().getMonth() + 1;
  const mNew = s.match(/^(\d{2})(\d{2})\.(\d{4,5})(v\d+)?$/);
  const mOld = s.match(/^([a-z-]+(?:\.[A-Z]{2})?)\/(\d{2})(\d{2})(\d{3})(v\d+)?$/);
  if (mNew) {
    const yy = Number(mNew[1]);
    const mm = Number(mNew[2]);
    const seqLen = mNew[3].length;
    if (mm < 1 || mm > 12) checks.push(check("range", 1, `${mm}월은 존재하지 않습니다.`));
    if (yy < 7 || (yy === 7 && mm < 4)) checks.push(check("temporal", 1, "현재 형식(YYMM.NNNNN)의 arXiv 번호는 2007년 4월부터 부여되었습니다."));
    if (yy > nowYY || (yy === nowYY && mm > nowMonth)) checks.push(check("range", 1, "아직 오지 않은 연월의 번호입니다."));
    const yymm = yy * 100 + mm;
    if (seqLen === 5 && yymm < 1501) checks.push(check("issuance", 0.9, "다섯 자리 일련번호는 2015년 1월 이후 번호에만 쓰입니다."));
    if (seqLen === 4 && yymm >= 1501) checks.push(check("issuance", 0.9, "2015년 1월 이후 번호는 일련번호가 다섯 자리입니다."));
    return { type: "arxiv", raw: String(raw), canonical: `${mNew[1]}${mNew[2]}.${mNew[3]}`, checks, F: combineChecks(checks) };
  }
  if (mOld) {
    const yy = Number(mOld[2]);
    const mm = Number(mOld[3]);
    if (mm < 1 || mm > 12) checks.push(check("range", 1, `${mm}월은 존재하지 않습니다.`));
    if (!(yy >= 91 || yy <= 7)) checks.push(check("temporal", 1, "구 형식(분야/YYMMNNN) 번호는 1991년~2007년에만 쓰였습니다."));
    return { type: "arxiv", raw: String(raw), canonical: `${mOld[1]}/${mOld[2]}${mOld[3]}${mOld[4]}`, checks, F: combineChecks(checks) };
  }
  checks.push(check("system", 1, "arXiv 번호 형식(YYMM.NNNNN 또는 분야/YYMMNNN)이 아닙니다."));
  return { type: "arxiv", raw: String(raw), canonical: s, checks, F: combineChecks(checks) };
}

// PubMed PMID는 1부터 차례로 부여되어 2025년 기준 4천만 번대다.
const PMID_CEILING = 45_000_000;
export function checkPmid(raw) {
  const s = String(raw || "").trim().replace(/^pmid:?\s*/i, "");
  const checks = [];
  if (!/^\d{1,9}$/.test(s)) checks.push(check("system", 1, "PMID는 숫자로만 이루어집니다."));
  else if (Number(s) === 0) checks.push(check("range", 1, "PMID 0은 부여되지 않습니다."));
  else if (Number(s) > PMID_CEILING) checks.push(check("range", 0.8, "아직 부여되지 않았을 가능성이 큰 범위의 PMID입니다."));
  if (/^0/.test(s)) checks.push(check("issuance", 0.6, "PMID는 0으로 시작하지 않습니다."));
  return { type: "pmid", raw: String(raw), canonical: String(Number(s) || s), checks, F: combineChecks(checks) };
}

export function checkIsbn(raw) {
  const s = String(raw || "").replace(/^isbn(-1[03])?:?\s*/i, "").replace(/[\s-]/g, "").toUpperCase();
  const checks = [];
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = s.split("").reduce((acc, ch, i) => acc + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0);
    if (sum % 11 !== 0) checks.push(check("issuance", 1, "ISBN-10 체크 숫자가 맞지 않습니다."));
  } else if (/^\d{13}$/.test(s)) {
    if (!/^97[89]/.test(s)) checks.push(check("system", 1, "ISBN-13은 978 또는 979로 시작합니다."));
    const sum = s.split("").reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    if (sum % 10 !== 0) checks.push(check("issuance", 1, "ISBN-13 체크 숫자가 맞지 않습니다."));
  } else {
    checks.push(check("system", 1, "ISBN은 10자리 또는 13자리입니다."));
  }
  return { type: "isbn", raw: String(raw), canonical: s, checks, F: combineChecks(checks) };
}

export function checkIdentifier({ type, value, court }) {
  switch (type) {
    case "case":
      return checkCaseNumber(value, court);
    case "doi":
      return checkDoi(value);
    case "arxiv":
      return checkArxiv(value);
    case "pmid":
      return checkPmid(value);
    case "isbn":
      return checkIsbn(value);
    default:
      return null;
  }
}
