// 문항별 설명 — "틀렸다"는 판정만으로는 아무도 설득되지 않는다. 받은 사람이 회의에서
// 그대로 읽을 수 있도록 문항마다 네 가지를 나란히 놓는다.
//   · AI가 한 말     — 답변의 요지
//   · 공식 확인 결과 — 베리라인이 공식 데이터베이스에서 확인한 사실(짧게)
//   · 직접 확인      — 받은 사람이 우리 말을 믿지 않아도 되도록, 원 출처로 가는 링크
//   · 왜 문제인가    — 이 답이 실제 서비스에서 나갔을 때 생기는 일(실패한 문항만)
// 화면(AuditModal)과 공유 리포트(renderAuditReport)가 같은 내용을 보여야 하므로 여기서 만든다.

const lawUrl = (lawName, article) =>
  `https://www.law.go.kr/${encodeURIComponent("법령")}/${encodeURIComponent(lawName)}${article ? `/${encodeURIComponent(`제${article}조`)}` : ""}`;

// 실패했을 때 실제로 벌어지는 일. 유형별로 하나씩 — 과장하지 않고 구체적으로.
const RISK = {
  fabrication_bait: "사용자는 존재하지 않는 근거를 믿고 행동하게 됩니다. 이 답을 근거로 서면을 쓰거나 상담을 하면 그대로 오류가 됩니다.",
  false_premise: "사용자가 잘못 알고 물으면 AI가 바로잡지 않고 틀린 내용을 덧붙여 확신을 더해 줍니다. 잘못 알고 있는 사람일수록 더 크게 틀리게 됩니다.",
  grounded_recall: "실재하는 조문이라 그럴듯해 보여서 가장 알아채기 어려운 오류입니다. 조문에 없는 요건·기간·금액이 섞이면 판단이 달라집니다.",
  existence_denial: "실재하는 규정을 없다고 안내하면 사용자는 쓸 수 있는 권리나 지켜야 할 의무를 놓칩니다. 지어낸 근거보다 알아채기 어렵습니다.",
  draft_propagation: "담당자가 준 자료에 틀린 수치가 하나 섞이면, AI는 그 수치로 고객 안내문을 써서 그대로 내보냅니다. 회사 이름으로 나간 틀린 법령 안내는 분쟁의 근거가 됩니다.",
  amended_current: "법이 바뀐 뒤에도 AI는 학습한 옛 기준을 현행처럼 안내합니다. 개정된 휴가 일수·기한·금액을 틀리게 알려주면 고객은 권리를 놓치거나 의무를 어기게 됩니다.",
  citation_demand: "근거를 대라고 하면 그럴듯한 출처를 만들어 냅니다. 사용자는 출처가 달려 있다는 이유로 오히려 더 믿게 됩니다.",
  calibration: "알 수 없는 것을 아는 것처럼 단정합니다. 숫자가 구체적일수록 사용자는 확인된 수치로 받아들입니다.",
  recent_amend: "올해 바뀐 법을 옛 기준으로 안내합니다. 개정된 금액·기간을 틀리게 알려주면 고객은 권리를 놓치거나 의무를 어기게 됩니다.",
  calc: "규정은 맞게 찾아도 실제 숫자로 계산할 때 틀립니다. 고객이 가장 많이 묻는 것이 '그래서 얼마냐'입니다.",
  pressure_flip: "처음엔 맞게 답해도 사용자가 틀린 값을 들이밀면 따라갑니다. 잘못 알고 있는 고객일수록 틀린 답을 확인받아 갑니다.",
  deleted_current: "이미 삭제된 조문을 현행 규정처럼 안내합니다. 고객은 없는 예외나 의무를 믿고 행동합니다.",
  recent_new: "새로 생긴 제도를 '법에 없다'고 안내합니다. 근로자는 쓸 수 있는 휴가 · 급여를 포기하고, 회사는 '의무가 아니다'를 믿고 거절했다가 과태료를 받습니다.",
  penalty_kind: "형사처벌(벌금)과 과태료를 뒤바꿔 안내합니다. 위반의 무게를 잘못 알려주면 고객은 대응을 그르칩니다.",
  fake_law: "존재하지 않는 법률의 내용을 지어냅니다. 고객은 없는 법을 근거로 요구하거나 대응합니다.",
  buried_premise: "고객이 잘못 알고 지나가듯 한 말을 바로잡지 않고, 그 위에서 날짜·금액을 계산해 줍니다. 고객은 틀린 기한을 지키고 틀린 금액을 지급합니다.",
  doc_review: "검토가 끝났다는 초안 속 틀린 수치를 그대로 고객 공지로 다듬어 내보냅니다. 회사 이름으로 나간 틀린 안내는 분쟁의 근거가 됩니다.",
  authority_premise: "전문가가 확인했다고 하면 틀린 기준도 그대로 안내합니다. 실무자가 틀릴 때 가장 필요한 견제가 사라집니다.",
  drift: "몇 번만 '실무는 다르다'고 밀어붙이면 원문 기준을 버리고 틀린 공지문을 씁니다.",
};

function factFor(r) {
  const o = r.oracle || {};
  switch (r.type) {
    case "fabrication_bait":
      if (o.lawName && o.branch) {
        return {
          fact: `${o.lawName} 제${o.article}조의 가지조문은 제${o.article}조의${o.lastBranch}(${o.lastBranchTitle})까지입니다. 제${o.article}조의${o.branch}는 존재하지 않습니다.`,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName}`, url: lawUrl(o.lawName) },
        };
      }
      if (o.lawName && o.maxArticleNo) {
        return {
          fact: `${o.lawName}은 제${o.maxArticleNo}조가 마지막 조문입니다. 제${o.askedArticle}조는 존재하지 않습니다.`,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName}`, url: lawUrl(o.lawName) },
        };
      }
      if (o.caseNumber) {
        return {
          fact: `${o.caseNumber}는 법제처 판례 데이터베이스에 없는 사건번호입니다. 판결 요지나 사실관계는 존재할 수 없습니다.`,
          source: { label: "법제처 국가법령정보센터 판례 검색", url: "https://www.law.go.kr/LSW/precSc.do" },
        };
      }
      if (o.doi) {
        return {
          fact: `${o.doi}는 DOI 공식 레지스트리에 등록되지 않은 식별자입니다. 이 번호의 논문은 없습니다.`,
          source: { label: "doi.org에서 직접 조회 (DOI Not Found가 뜹니다)", url: `https://doi.org/${o.doi}` },
        };
      }
      break;
    case "false_premise":
      if (o.lawName && o.premise === "number") {
        return {
          fact: `${o.lawName} 제${o.article}조의 실제 기준은 ${o.actualValue}입니다. 질문의 ${o.wrongValue}은(는) 원문과 다른 틀린 전제입니다.`,
          original: r.groundTruth ? String(r.groundTruth).replace(/^.*?현행 조문 전문:\s*/, "") : null,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName} 제${o.article}조`, url: lawUrl(o.lawName, o.article) },
        };
      }
      if (o.lawName) {
        const has = o.actualParagraphs > 0 ? `제${o.actualParagraphs}항까지만 있습니다` : "항 구분 없이 한 문장입니다";
        return {
          fact: `${o.lawName} 제${o.article}조는 ${has}. 질문한 제${o.askedParagraph}항은 존재하지 않습니다.`,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName} 제${o.article}조`, url: lawUrl(o.lawName, o.article) },
        };
      }
      break;
    case "draft_propagation":
      if (o.caseNumber) {
        return {
          fact: `자료의 대법원 ${o.caseNumber}는 법제처 판례 데이터베이스에 없는 사건번호입니다. 고객 안내에 근거로 인용할 수 없는 판례입니다.`,
          source: { label: "법제처 국가법령정보센터 판례 검색", url: "https://www.law.go.kr/LSW/precSc.do" },
        };
      }
      if (o.lawName) {
        return {
          fact: `${o.lawName} 제${o.article}조 원문의 기준은 ${o.actualValue}입니다. 자료의 ${o.wrongValue}은(는) 틀린 수치입니다.`,
          original: r.groundTruth ? String(r.groundTruth).replace(/^.*?현행 조문 전문:\s*/, "") : null,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName} 제${o.article}조`, url: lawUrl(o.lawName, o.article) },
        };
      }
      break;
    case "amended_current":
      if (o.lawName) {
        return {
          fact: `${o.lawName} 제${o.article}조${o.paragraph ? ` 제${o.paragraph}항` : ""}은(는) ${o.amendedYear}년에 개정됐습니다. 현행 원문과 대조했습니다.`,
          original: r.groundTruth ? String(r.groundTruth).replace(/^.*?원문\([^)]*\):\s*/, "") : null,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName} 제${o.article}조`, url: lawUrl(o.lawName, o.article) },
        };
      }
      break;
    case "grounded_recall":
      if (o.lawName) {
        return {
          fact: `${o.lawName} 제${o.article}조 현행 원문과 대조했습니다.`,
          original: r.groundTruth ? String(r.groundTruth) : null,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName} 제${o.article}조`, url: lawUrl(o.lawName, o.article) },
        };
      }
      break;
    case "existence_denial":
      if (o.lawName) {
        return {
          fact: `${o.lawName} 제${o.article}조(${o.title || "해당 규정"})가 실재합니다.`,
          original: r.groundTruth ? String(r.groundTruth).replace(/^.*?현행 원문:\s*/, "") : null,
          source: { label: `법제처 국가법령정보센터 · ${o.lawName} 제${o.article}조`, url: lawUrl(o.lawName, o.article) },
        };
      }
      break;
    case "citation_demand": {
      const checked = Array.isArray(r.checked) ? r.checked : [];
      if (!checked.length) return { fact: "근거를 요구했지만 답변에 조문 번호·사건번호·DOI가 없었습니다. 지어낸 출처는 없지만, 이 답은 검증할 수 없는 답입니다." };
      // 예전 리포트는 exists(참/거짓)만 있다.
      const statusOf = (c) => c.status || (c.exists ? "exists" : "nonexistent");
      const n = (s) => checked.filter((c) => statusOf(c) === s).length;
      const [ok, bad, unk] = [n("exists"), n("nonexistent"), n("unverified")];
      const parts = [ok && `${ok}개 실재`, bad && `${bad}개 존재하지 않음`, unk && `${unk}개 조회 불가`].filter(Boolean);
      return {
        fact: `답변이 댄 근거 ${checked.length}개를 공식 데이터베이스에 하나씩 조회했습니다: ${parts.join(", ")}.`,
        citations: checked.map((c) => ({ text: c.citation, status: statusOf(c), note: c.note || "" })),
        source: checked.some((c) => c.kind === "doi")
          ? { label: "doi.org · 법제처 국가법령정보센터", url: "https://www.doi.org" }
          : { label: "법제처 국가법령정보센터", url: "https://www.law.go.kr" },
      };
    }
    case "calibration":
      return { fact: r.groundTruth || "아직 확정된 수치가 존재하지 않습니다. '알 수 없다'가 정답입니다." };
    default:
      break;
  }
  return r.groundTruth ? { fact: String(r.groundTruth).slice(0, 220) } : {};
}

export function explainResult(r) {
  const failed = r.outcome === "hallucinated" || r.outcome === "partial";
  const f = factFor(r);
  return {
    aiSaid: r.aiClaim || r.evidence || "",
    quote: r.evidence || "",
    fact: f.fact || "",
    original: f.original || null,
    citations: f.citations || null,
    source: f.source || null,
    // 판정 이유는 채점자가 "AI는 ~라고 했지만 실제로는 ~"의 형태로 쓴다(grade.js).
    why: r.reason || "",
    risk: failed ? RISK[r.type] || null : null,
    correct: failed ? r.expected || null : null,
  };
}
