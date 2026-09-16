// 특허 검색공간 정의부(130) — 식별자 유형별로 "이론상 대상이 있을 수 있는 전체 집합(SS)"을
// 정의하고, 각 참조 DB가 그중 얼마를 수록하는지(completeness)를 사전 메타데이터로 둔다
// (청구항 8). 수록률은 각 기관이 공표한 수록 범위를 바탕으로 한 추정값이며, 화면에도
// 반드시 "추정"으로 표시한다. 운영하면서 실측 데이터가 쌓이면 여기 값만 보정하면 된다.
//
// uncovered는 SS_uncovered(미탐색 영역)의 성격과 확인 절차 안내다(청구항 7).

export const SEARCH_SPACES = {
  case_supreme: {
    label: "대법원 판결",
    sources: {
      "law.go.kr:prec": { label: "법제처 국가법령정보 판례", completeness: 0.8 },
      "law.go.kr:citation": { label: "공개 판결문 속 인용(참조판례)", completeness: 0.2 },
      web: { label: "웹 검색(판례 해설·보도)", completeness: 0.5 },
    },
    uncovered: [
      { area: "심리불속행 기각 등 판결 이유가 공개되지 않은 사건", howToCheck: "대법원 종합법률정보(glaw.scourt.go.kr)에서 사건번호로 검색" },
      { area: "비실명 처리가 끝나지 않아 아직 공개되지 않은 최근 판결", howToCheck: "법원 ‘판결서 인터넷 열람’ 서비스에서 사건번호로 열람 신청" },
    ],
  },
  case_constitutional: {
    label: "헌법재판소 결정",
    sources: {
      "law.go.kr:detc": { label: "법제처 국가법령정보 헌재결정례", completeness: 0.95 },
      web: { label: "웹 검색(결정 해설·보도)", completeness: 0.5 },
    },
    uncovered: [
      { area: "아직 결정이 선고되지 않고 계속 중인 사건", howToCheck: "헌법재판소 누리집의 사건검색에서 사건번호로 조회" },
    ],
  },
  case_appellate: {
    label: "고등법원·지방법원 항소부 판결",
    sources: {
      "law.go.kr:prec": { label: "법제처 국가법령정보 판례", completeness: 0.15 },
      "law.go.kr:citation": { label: "공개 판결문 속 인용(참조판례)", completeness: 0.15 },
      web: { label: "웹 검색(판례 해설·보도)", completeness: 0.3 },
    },
    uncovered: [
      { area: "공개 판례 DB에 수록되지 않은 대부분의 하급심 판결", howToCheck: "법원 ‘판결서 인터넷 열람’ 서비스(유료) 또는 법원도서관 특별열람실" },
      { area: "사건 당사자만 확인할 수 있는 진행 중 사건", howToCheck: "대법원 ‘나의 사건검색’에서 사건번호와 당사자명으로 조회" },
    ],
  },
  case_patent: {
    label: "특허법원 판결",
    sources: {
      "law.go.kr:prec": { label: "법제처 국가법령정보 판례", completeness: 0.3 },
      web: { label: "웹 검색", completeness: 0.3 },
    },
    uncovered: [
      { area: "공개 판례 DB에 수록되지 않은 특허법원 판결", howToCheck: "법원 ‘판결서 인터넷 열람’ 서비스 또는 특허법원 누리집" },
    ],
  },
  case_district: {
    label: "지방법원 1심 판결",
    sources: {
      "law.go.kr:prec": { label: "법제처 국가법령정보 판례", completeness: 0.05 },
      "law.go.kr:citation": { label: "공개 판결문 속 인용(참조판례)", completeness: 0.1 },
      web: { label: "웹 검색(판례 해설·보도)", completeness: 0.2 },
    },
    uncovered: [
      { area: "공개 판례 DB에 거의 수록되지 않는 1심 판결 전반", howToCheck: "법원 ‘판결서 인터넷 열람’ 서비스(유료) 또는 법원도서관 특별열람실" },
      { area: "사건 당사자만 확인할 수 있는 진행 중 사건", howToCheck: "대법원 ‘나의 사건검색’에서 사건번호와 당사자명으로 조회" },
    ],
  },
  case_unknown: {
    label: "법원 판결(심급 불명)",
    sources: {
      "law.go.kr:prec": { label: "법제처 국가법령정보 판례", completeness: 0.3 },
      web: { label: "웹 검색", completeness: 0.3 },
    },
    uncovered: [{ area: "사건부호로 심급을 특정할 수 없어 수록 범위를 가늠하기 어려운 사건", howToCheck: "대법원 종합법률정보(glaw.scourt.go.kr)에서 사건번호로 검색" }],
  },
  statute: {
    label: "대한민국 법령(법률·대통령령·총리령·부령)",
    sources: {
      "law.go.kr:law": { label: "법제처 국가법령정보 법령", completeness: 0.98 },
      web: { label: "웹 검색", completeness: 0.4 },
    },
    uncovered: [
      { area: "공포되었지만 아직 DB에 반영되지 않은 최신 제·개정 법령", howToCheck: "관보(gwanbo.go.kr) 또는 국가법령정보센터의 ‘최신 공포법령’" },
      { area: "국회에 계류 중인 법률안(아직 법령이 아님)", howToCheck: "국회 의안정보시스템(likms.assembly.go.kr)" },
    ],
  },
  statute_abbrev: {
    label: "법령 약칭·비공식 명칭",
    sources: {
      "law.go.kr:law": { label: "법제처 국가법령정보 법령(정식 명칭만 색인)", completeness: 0.35 },
      web: { label: "웹 검색", completeness: 0.4 },
    },
    uncovered: [
      { area: "공식 DB가 색인하지 않는 법령 약칭·통칭", howToCheck: "정식 법령명으로 국가법령정보센터(law.go.kr)에서 다시 검색" },
    ],
  },
  admin_rule: {
    label: "행정규칙(고시·훈령·예규·지침)",
    sources: {
      "law.go.kr:admrul": { label: "법제처 국가법령정보 행정규칙", completeness: 0.85 },
      web: { label: "웹 검색", completeness: 0.4 },
    },
    uncovered: [{ area: "각 부처가 법제처에 등록하지 않은 내부 지침", howToCheck: "해당 부처 누리집의 훈령·예규·고시 게시판" }],
  },
  ordinance: {
    label: "자치법규(조례·규칙)",
    sources: {
      "law.go.kr:ordin": { label: "법제처 국가법령정보 자치법규", completeness: 0.95 },
      web: { label: "웹 검색", completeness: 0.4 },
    },
    uncovered: [{ area: "공포 직후 아직 등록되지 않은 자치법규", howToCheck: "해당 지방자치단체 누리집의 자치법규 게시판" }],
  },
  article: {
    label: "현행 법령의 조문",
    sources: { "law.go.kr:lawtext": { label: "법제처 현행 법령 전문", completeness: 1.0 } },
    uncovered: [{ area: "현행 조문이 아닌 개정 전(구법) 조문", howToCheck: "국가법령정보센터의 ‘연혁법령’에서 해당 시점 조문 확인" }],
  },
  doi: {
    label: "DOI 등록 문헌",
    sources: { "doi.org": { label: "DOI 핸들 시스템(doi.org)", completeness: 0.99 } },
    uncovered: [{ area: "DOI가 없는 문헌(학위논문·국내 학술지 일부)", howToCheck: "문헌 제목으로 Google Scholar·RISS·KCI에서 검색" }],
  },
  arxiv: {
    label: "arXiv 사전 공개 논문",
    sources: { "arxiv.org": { label: "arXiv API", completeness: 1.0 } },
    uncovered: [],
  },
  pmid: {
    label: "PubMed 수록 문헌",
    sources: { "pubmed": { label: "NCBI PubMed(E-utilities)", completeness: 1.0 } },
    uncovered: [],
  },
  isbn: {
    label: "ISBN 부여 도서",
    sources: { openlibrary: { label: "Open Library", completeness: 0.5 } },
    uncovered: [{ area: "Open Library에 수록되지 않은 도서(특히 국내 도서)", howToCheck: "국립중앙도서관 서지정보 유통지원시스템(nl.go.kr/seoji)에서 ISBN 검색" }],
  },
};

export function caseSpaceKey(level) {
  return { supreme: "case_supreme", constitutional: "case_constitutional", appellate: "case_appellate", patent: "case_patent", district: "case_district" }[level] || "case_unknown";
}

// 커버리지 C (수학식 1, C = |SS_covered| / |SS|). 여러 DB를 탐색했으면 서로 독립적으로
// 수록한다고 보고 합집합 비율 1 − Π(1 − cᵢ)로 추정한다. 탐색에 실패한 DB는 넣지 않는다.
// ── 일반 사실 주장의 검색공간 ────────────────────────────────────────────
// 식별자(법령·판례·DOI)는 레지스트리가 검색공간이지만, "2024년 대구 중구 안경 공방 평균
// 객단가는 18만 7천원" 같은 주장에는 레지스트리가 없다. 대신 기준이 하나 있다 —
// 이 주장이 사실이라면 어디엔가 기록되어 있어야 한다. 그 '어디'가 검색공간이다.
//
// 그래서 공간을 주장의 기록 가능성(recordedness)으로 나눈다. 공공 통계처럼 사실이라면
// 반드시 공표되는 것은 수록률이 높고, 비공개 내부 정보는 낮다. 수록률이 높은 공간을
// 다 뒤져도 없다면 그건 "유메가 못 찾은 것"이 아니라 "그런 사실이 없는 것"에 가깝다.
// AI가 그걸 확언했다면 지어낸 것이다 — 부존재 검증이 잡아내야 할 바로 그 경우다.
const ASSERTION_SPACES = {
  public_record: {
    label: "정부·공공기관 공식 기록(통계·공시·관보·등기)",
    sources: {
      web: { label: "공공 통계·공시 포털 및 웹 검색", completeness: 0.9 },
      "official:registry": { label: "공식 레지스트리 직접 조회", completeness: 0.5 },
    },
    uncovered: [
      { area: "공표 주기가 지나지 않아 아직 공개되지 않은 최신 집계", howToCheck: "해당 기관에 정보공개청구(open.go.kr)" },
      { area: "비공개로 분류된 행정 자료", howToCheck: "소관 기관에 직접 문의" },
    ],
  },
  published: {
    label: "공개 출판물(논문·도서·보고서)",
    sources: { web: { label: "학술 검색 및 웹 검색", completeness: 0.85 } },
    uncovered: [
      { area: "유료 데이터베이스에만 수록된 문헌", howToCheck: "RISS·KISS·DBpia 등에서 기관 계정으로 검색" },
      { area: "출판되지 않은 학위논문·내부 보고서", howToCheck: "발행 기관 자료실에 직접 문의" },
    ],
  },
  reported: {
    label: "언론 보도·기관 공식 발표",
    sources: { web: { label: "뉴스 및 웹 검색", completeness: 0.85 } },
    uncovered: [
      { area: "아카이브가 남지 않은 오래된 보도", howToCheck: "한국언론진흥재단 빅카인즈(bigkinds.or.kr)에서 원문 검색" },
      { area: "지역 소식지 등 온라인에 없는 매체", howToCheck: "해당 지역 도서관 정기간행물실" },
    ],
  },
  niche: {
    label: "업계·전문 영역 자료",
    sources: { web: { label: "웹 검색", completeness: 0.5 } },
    uncovered: [
      { area: "업계 내부에서만 공유되는 자료", howToCheck: "관련 협회·학회에 문의" },
      { area: "회원 전용 커뮤니티·유료 리포트", howToCheck: "해당 서비스에 직접 가입해 확인" },
    ],
  },
  private: {
    label: "비공개 정보(개별 기업·기관 내부 자료)",
    sources: { web: { label: "웹 검색", completeness: 0.15 } },
    uncovered: [
      { area: "공시 의무가 없는 기업의 내부 수치", howToCheck: "해당 기업에 직접 문의하거나 공시 자료 확인" },
      { area: "당사자만 아는 계약·거래 내용", howToCheck: "당사자에게 확인" },
    ],
  },
  unrecordable: {
    label: "기록으로 남지 않는 영역(개인 경험·미래 예측·주관적 평가)",
    sources: { web: { label: "웹 검색", completeness: 0.05 } },
    uncovered: [
      { area: "애초에 공개 기록이 존재하지 않는 성격의 내용", howToCheck: "검증 대상이 아닙니다 — 사실 주장으로 다루지 마세요" },
    ],
  },
};

export const RECORDEDNESS = Object.keys(ASSERTION_SPACES);
Object.assign(SEARCH_SPACES, ASSERTION_SPACES);

export function coverageFor(spaceKey, searchedIds) {
  const space = SEARCH_SPACES[spaceKey];
  const searched = searchedIds.map((s) => {
    const meta = space.sources[s.id] || { label: s.id, completeness: 0 };
    return { id: s.id, label: meta.label, completeness: meta.completeness, ok: !!s.ok };
  });
  const miss = searched.filter((s) => s.ok).reduce((acc, s) => acc * (1 - s.completeness), 1);
  return { value: Math.round((1 - miss) * 1000) / 1000, searched };
}
