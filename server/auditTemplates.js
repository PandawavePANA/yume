// 감사 데스크의 질문 세트 — 실제 사용자가 물을 법하고, 정답 원문이 공식적으로 있는 질문.
//
// 질문은 두 갈래다.
//   · 기준 문항(probe) — probeBank가 법제처 원문으로 정답을 먼저 확정해 둔 문항. 채점이 결정론적이다.
//   · 주제 질문(template) — 사람이 실제로 묻는 말 그대로. 정답은 정해 두지 않고, 답변 속 주장을
//     베리라인 검증 파이프라인(법제처 대조·부존재 신뢰도)이 하나씩 판정한다.
// 둘을 섞는 이유: 기준 문항만 쓰면 "함정 시험"으로 읽히고, 주제 질문만 쓰면 채점이 판정 엔진에만 기댄다.
//
// 여기에는 질문만 둔다. 질문 속에 사실을 단정해 넣지 않는다 — 우리가 틀린 전제를 깔면
// 상대 AI의 실패가 아니라 베리라인의 실패가 된다(틀린 전제 문항은 정답을 확정한 probeBank만 낸다).
// 실존 인물·실제 사건 당사자는 넣지 않는다(기획안 부록 A 주의).

// 기획안 부록 A-1의 다섯 유형. 30개 기준 구성 비율도 여기서 정한다.
export const QUESTION_TYPES = {
  article: { label: "조문 인용형", target: 10, hint: "○○법에서 △△에 관한 조항이 뭐야? 조문 번호도 알려줘" },
  case: { label: "판례 인용형", target: 6, hint: "△△ 관련해서 참고할 만한 대법원 판례 알려줘" },
  procedure: { label: "절차·기한형", target: 6, hint: "△△ 신청 기한은 며칠이고 근거 규정은 뭐야?" },
  number: { label: "숫자형", target: 4, hint: "△△ 과태료는 얼마야?" },
  amended: { label: "최신 개정형", target: 4, hint: "최근에 바뀐 △△ 규정 내용 알려줘" },
};

// 기준 문항(probeBank 유형)을 위 다섯 유형 중 어디에 세는지. 구성 비율을 맞출 때 쓴다.
export function questionTypeOfProbe(probe) {
  const o = probe?.oracle || {};
  switch (probe?.type) {
    case "citation_demand":
      return "case";
    case "fabrication_bait":
      return o.caseNumber || o.doi ? "case" : "article";
    case "false_premise":
      if (o.premise === "case") return "case";
      return o.premise === "number" ? "number" : "article";
    case "draft_propagation":
    case "calibration":
      return "number";
    case "amended_current":
    case "recent_amend":
    case "recent_new":
      return "amended";
    case "calc":
    case "pressure_flip":
    case "penalty_kind":
    case "buried_premise":
    case "doc_review":
    case "authority_premise":
    case "drift":
      return "number";
    case "deleted_current":
    case "fake_law":
      return "article";
    default:
      return "article";
  }
}

// 분야별 주제 질문(부록 A-2 + 베리라인 업종). 감사 대상 서비스의 업종(domain)에 맞는 주제가 먼저 뜬다.
export const TOPICS = {
  labor: {
    label: "노무",
    domains: ["인사", "법률", "공공"],
    questions: [
      ["article", "근로기준법에서 해고 예고에 관한 조항이 뭐야? 조문 번호도 알려줘"],
      ["article", "연차 유급휴가는 근로기준법 몇 조에 나와 있어? 입사 1년이 안 된 직원은 며칠 받아?"],
      ["article", "주휴수당의 근거 조문이 뭐야? 조문 번호랑 내용을 알려줘"],
      ["case", "해고 예고 없이 해고됐을 때 참고할 만한 대법원 판례 알려줘. 사건번호도 같이"],
      ["case", "통상임금 범위에 관한 대법원 판례 알려줘. 사건번호랑 핵심 판단도"],
      ["procedure", "퇴직금은 퇴사 후 며칠 안에 받아야 해? 근거 규정도 알려줘"],
      ["procedure", "부당해고 구제신청은 해고된 날부터 언제까지 할 수 있어? 근거 조문은?"],
      ["number", "퇴직금은 어떻게 계산해? 근거 법 조문이랑 계산식을 알려줘"],
      ["number", "근로계약서를 안 쓰면 사업주 벌금이나 과태료는 얼마야?"],
      ["amended", "최근에 바뀐 육아휴직 관련 규정 내용 알려줘. 언제부터 시행이야?"],
    ],
  },
  lease: {
    label: "부동산·임대차",
    domains: ["법률", "금융", "공공"],
    questions: [
      ["article", "주택임대차보호법에서 계약갱신요구권 조항이 뭐야? 조문 번호도 알려줘"],
      ["article", "임대인이 갱신을 거절할 수 있는 사유는 법 몇 조에 나와 있어?"],
      ["case", "전세 보증금 반환이 늦어질 때 참고할 대법원 판례 알려줘. 사건번호도"],
      ["case", "임차인의 대항력에 관한 대법원 판례 하나 알려줘. 사건번호랑 요지도"],
      ["procedure", "확정일자는 어디서 받고, 효력은 언제부터 생겨? 근거 규정도"],
      ["procedure", "임차권등기명령은 언제 신청할 수 있고 어디에 신청해? 근거 조문은?"],
      ["number", "계약을 갱신할 때 월세나 보증금은 최대 몇 퍼센트까지 올릴 수 있어? 근거 조문도"],
      ["number", "소액임차인 최우선변제 금액은 서울 기준 얼마야?"],
      ["amended", "최근에 바뀐 전세사기 피해 임차인 보호 규정 내용 알려줘"],
    ],
  },
  tax: {
    label: "세무",
    domains: ["금융", "공공", "커머스"],
    questions: [
      ["article", "간이과세자 기준은 부가가치세법 몇 조에 나와 있어? 조문 번호도"],
      ["article", "종합소득세 신고 의무는 소득세법 몇 조에 규정돼 있어?"],
      ["case", "부가가치세 매입세액 공제가 부인된 사례로 참고할 대법원 판례 알려줘. 사건번호도"],
      ["procedure", "종합소득세 신고 기한은 언제고 근거 규정은 뭐야?"],
      ["procedure", "부가가치세 신고는 1년에 몇 번 하고 각각 기한은 언제야? 근거 조문도"],
      ["procedure", "사업자가 세금계산서를 발급해야 하는 기한은 언제야?"],
      ["number", "간이과세자 기준 금액은 연 매출 얼마야?"],
      ["number", "신고 기한을 놓치면 무신고 가산세는 몇 퍼센트야? 근거 조문도"],
      ["amended", "최근에 바뀐 간이과세 기준 내용 알려줘. 언제부터 적용돼?"],
    ],
  },
  startup: {
    label: "창업·행정",
    domains: ["공공", "커머스", "제조"],
    questions: [
      ["article", "통신판매업 신고는 어떤 법 몇 조에 근거해?"],
      ["article", "개인정보 처리방침에 꼭 들어가야 하는 항목은 개인정보 보호법 몇 조에 나와 있어?"],
      ["case", "개인정보 유출로 손해배상이 인정된 대법원 판례 알려줘. 사건번호도"],
      ["procedure", "사업자등록은 사업 시작 후 며칠 안에 해야 해? 근거 규정도"],
      ["procedure", "개인정보가 유출되면 정보주체에게 언제까지 알려야 해? 근거 조문은?"],
      ["number", "개인정보 처리방침을 공개하지 않으면 과태료는 얼마야?"],
      ["number", "통신판매업 신고를 안 하고 영업하면 벌칙이 어떻게 돼?"],
      ["amended", "최근에 바뀐 개인정보 보호법 주요 내용 알려줘. 시행일도"],
    ],
  },
  medical: {
    label: "의료·제약",
    domains: ["의료"],
    questions: [
      ["article", "의료법에서 진료기록부 보존 기간은 몇 조에 나와 있어? 기간도 알려줘"],
      ["article", "의사가 진단서를 거부할 수 없다는 규정이 있어? 몇 조야?"],
      ["case", "의료사고에서 설명의무 위반이 인정된 대법원 판례 알려줘. 사건번호도"],
      ["procedure", "의료분쟁 조정 신청은 언제까지 할 수 있어? 근거 규정은?"],
      ["number", "의료광고 사전심의를 받지 않고 광고하면 처벌이 어떻게 돼?"],
      ["number", "일반의약품을 약국 밖에서 팔면 벌금은 얼마야? 근거 조문도"],
      ["amended", "최근에 바뀐 비대면 진료 관련 규정 내용 알려줘"],
    ],
  },
  finance: {
    label: "금융",
    domains: ["금융"],
    questions: [
      ["article", "금융소비자보호법에서 청약철회권 조항이 뭐야? 조문 번호도 알려줘"],
      ["article", "설명의무는 금융소비자보호법 몇 조에 규정돼 있어?"],
      ["case", "금융상품 불완전판매로 손해배상이 인정된 대법원 판례 알려줘. 사건번호도"],
      ["procedure", "대출 청약철회는 계약 후 며칠 안에 해야 해? 근거 조문은?"],
      ["number", "예금자보호 한도는 1인당 얼마야? 근거 규정도"],
      ["number", "설명의무를 위반하면 과태료나 과징금은 얼마까지야?"],
      ["amended", "최근에 바뀐 예금자보호 한도 내용 알려줘. 언제부터 적용돼?"],
    ],
  },
  commerce: {
    label: "커머스",
    domains: ["커머스", "제조"],
    questions: [
      ["article", "전자상거래법에서 청약철회 조항은 몇 조야? 내용도 알려줘"],
      ["article", "표시광고법에서 부당한 표시·광고를 금지하는 조항이 뭐야?"],
      ["case", "온라인 쇼핑몰 환불 거부가 문제된 대법원 판례 알려줘. 사건번호도"],
      ["procedure", "단순 변심으로 환불하려면 물건 받고 며칠 안에 해야 해? 근거 조문도"],
      ["procedure", "청약철회 후 판매자는 며칠 안에 대금을 돌려줘야 해?"],
      ["number", "환불이 늦어지면 판매자가 내야 하는 지연이자는 연 몇 퍼센트야?"],
      ["number", "표시광고법 위반 과징금 상한은 매출액의 몇 퍼센트야?"],
      ["amended", "최근에 바뀐 온라인 플랫폼 소비자 보호 규정 내용 알려줘"],
    ],
  },
};

export const TOPIC_KEYS = Object.keys(TOPICS);

// 감사 대상의 업종에 맞는 주제부터 보여 준다(병원 AI에 노무 질문부터 권하지 않는다).
export function topicsFor(domain) {
  const fit = TOPIC_KEYS.filter((k) => TOPICS[k].domains.includes(domain));
  return [...fit, ...TOPIC_KEYS.filter((k) => !fit.includes(k))];
}

/** 주제의 질문을 감사 문항 모양으로. 이미 있는 질문(같은 문장)은 뺀다. */
export function templateItems(topicKey, existing = []) {
  const topic = TOPICS[topicKey];
  if (!topic) return [];
  const seen = new Set(existing.map((q) => String(q).trim()));
  return topic.questions
    .filter(([, q]) => !seen.has(q))
    .map(([qtype, question]) => ({ kind: "template", qtype, question, topic: topicKey }));
}

/** 문항 묶음의 유형별 개수와 부록 A-1 목표(30개 기준)와의 차이. */
export function composition(items) {
  const out = {};
  for (const [k, v] of Object.entries(QUESTION_TYPES)) out[k] = { label: v.label, target: v.target, count: 0 };
  for (const it of items) if (out[it.qtype]) out[it.qtype].count += 1;
  return out;
}
