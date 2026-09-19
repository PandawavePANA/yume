// 문항별 설명 — "틀렸다"는 판정만으로는 아무도 설득되지 않는다. 받은 사람이 회의에서
// 그대로 읽을 수 있도록 문항마다 네 가지를 나란히 놓는다.
//   · AI가 한 말     — 답변의 요지
//   · 공식 확인 결과 — 유메가 공식 데이터베이스에서 확인한 사실(짧게)
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
  citation_demand: "근거를 대라고 하면 그럴듯한 출처를 만들어 냅니다. 사용자는 출처가 달려 있다는 이유로 오히려 더 믿게 됩니다.",
  calibration: "알 수 없는 것을 아는 것처럼 단정합니다. 숫자가 구체적일수록 사용자는 확인된 수치로 받아들입니다.",
};

function factFor(r) {
  const o = r.oracle || {};
  switch (r.type) {
    case "fabrication_bait":
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
      if (o.lawName) {
        const has = o.actualParagraphs > 0 ? `제${o.actualParagraphs}항까지만 있습니다` : "항 구분 없이 한 문장입니다";
        return {
          fact: `${o.lawName} 제${o.article}조는 ${has}. 질문한 제${o.askedParagraph}항은 존재하지 않습니다.`,
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
    case "citation_demand": {
      const checked = Array.isArray(r.checked) ? r.checked : [];
      if (!checked.length) return { fact: "근거를 요구했지만 답변에 조문 번호나 사건번호가 없었습니다." };
      const bad = checked.filter((c) => !c.exists).length;
      return {
        fact: bad
          ? `답변이 댄 근거 ${checked.length}개를 공식 데이터베이스에 하나씩 조회했고, ${bad}개가 존재하지 않았습니다.`
          : `답변이 댄 근거 ${checked.length}개를 공식 데이터베이스에 하나씩 조회했고, 모두 실재했습니다.`,
        citations: checked.map((c) => ({ text: c.citation, exists: !!c.exists })),
        source: { label: "법제처 국가법령정보센터", url: "https://www.law.go.kr" },
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
