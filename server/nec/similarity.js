// 특허 유사항목 근접도 분석부(160). 근접도 P는 0~1이며, 값이 클수록 "실재하는 대상을
// 살짝 틀리게 인용했을" 가능성을 뜻한다(부존재 신뢰도를 낮추는 쪽으로 작용).
import { normalizeLawName } from "./identifiers.js";

function lcsLength(a, b) {
  const dp = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function isSubsequence(small, big) {
  let i = 0;
  for (const ch of big) if (ch === small[i]) i += 1;
  return i === small.length;
}

export function lawNameSimilarity(claimed, candidate) {
  const a = normalizeLawName(claimed);
  const b = normalizeLawName(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dice = (2 * lcsLength(a, b)) / (a.length + b.length);
  // "주택임대차법" ⊂ "주택임대차보호법"처럼 글자 순서를 유지한 축약이면 가중.
  const abbrevBoost = a.length >= 3 && isSubsequence(a, b) ? 0.85 : 0;
  return Math.round(Math.max(dice, abbrevBoost) * 1000) / 1000;
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

// 사건번호끼리의 근접도: 같은 사건부호에서 일련번호 한 글자 차이(오타·전치)가 가장 가깝고,
// 연도만 1년 다르거나 같은 심급의 다른 부호로 바뀐 경우도 흔한 날조 패턴이라 높게 본다.
export function caseSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a.canonical === b.canonical) return 1;
  const sameCode = a.code === b.code;
  const sameSerial = a.serial === b.serial;
  const sameYear = a.year === b.year;
  if (sameCode && sameYear) {
    const d = editDistance(String(a.serial), String(b.serial));
    if (d === 1) return 0.92;
    if (d === 2) return 0.7;
    return 0.3;
  }
  if (sameCode && sameSerial && Math.abs(a.year - b.year) === 1) return 0.85;
  if (!sameCode && sameSerial && sameYear) return 0.8;
  return 0.2;
}

// 탐색으로 확인해볼 "그럴듯한 근접 사건번호" 후보. 외부 API 호출 수를 고려해 8개로 제한한다.
export function caseVariants(parsed, maxCount = 8) {
  const out = [];
  const push = (year, code, serial) => {
    if (serial <= 0) return;
    const y = year < 2000 ? String(year).slice(2) : String(year);
    const canonical = `${y}${code}${serial}`;
    if (canonical !== parsed.canonical && !out.includes(canonical)) out.push(canonical);
  };
  const s = String(parsed.serial);
  for (let i = 0; i < s.length - 1 && out.length < maxCount; i += 1) {
    const swapped = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
    if (!swapped.startsWith("0")) push(parsed.year, parsed.code, Number(swapped));
  }
  push(parsed.year - 1, parsed.code, parsed.serial);
  push(parsed.year + 1, parsed.code, parsed.serial);
  const siblings = { 다: ["두", "도"], 두: ["다", "도"], 도: ["다", "두"], 헌마: ["헌바"], 헌바: ["헌마", "헌가"], 가합: ["가단"], 가단: ["가합"] }[parsed.code] || [];
  for (const code of siblings) push(parsed.year, code, parsed.serial);
  return out.slice(0, maxCount);
}
