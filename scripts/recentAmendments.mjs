// 최근 개정 · 신설 조문 목록(2026-10-30) — 진단 질문을 만들 재료.
//
// 2026-10-29 로무앤톡 재감사에서 배운 것: 검색이 붙은 AI는 조문 번호를 주면 원문을 찾아 맞힌다.
// 약한 자리는 "최근 시행된 조문을 번호 없이 상황으로 물을 때"다. 그 조문을 찾는 일을 사람 기억에 맡기지 않고
// 법제처 버전 목록에서 바로 뽑는다 — 시행 버전마다 바로 앞 버전과 조문 문언을 견줘 실제로 바뀐 것만 남긴다
// (부처 이름 바꾸기 같은 문구 정리는 뺀다). 모델 호출 없음.
//
// 쓰는 법:  node --env-file=.env scripts/recentAmendments.mjs [--since 20260101] [법령명 ...]
//           법령명을 안 주면 노무 · 세무 · 생활법률 기본 묶음. 결과는 표준 출력(마크다운).
import { listStatuteVersions, getStatuteArticlesAt } from "../server/lawApi.js";

const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const SINCE = sinceIdx >= 0 ? args.splice(sinceIdx, 2)[1] : `${new Date().getFullYear()}0101`;
const LAWS = args.length ? args : [
  "근로기준법", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "근로자퇴직급여 보장법", "고용보험법", "산업재해보상보험법", "임금채권보장법",
  "노동조합 및 노동관계조정법", "산업안전보건법", "최저임금법", "기간제 및 단시간근로자 보호 등에 관한 법률",
  "부가가치세법", "소득세법", "국세기본법", "조세특례제한법", "법인세법",
  "주택임대차보호법", "상가건물 임대차보호법", "민법", "개인정보 보호법",
];
// 바뀐 것처럼 보이지만 내용은 같은 문구 정리(부처 · 기관 이름)는 같게 본다
const norm = (s) => String(s).replace(/<[^>]*>/g, "").replace(/(국가데이터처|통계청|재정경제부|기획재정부)장?(관)?/g, "X").replace(/\s+/g, " ").trim();
const key = (a) => `${a.no}-${a.branch || 0}`;
const ref = (a) => `제${a.no}조${a.branch ? `의${a.branch}` : ""}`;
const ymd = (s) => String(s).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

function diffSpan(oldText, newText, ctx = 60) {
  let s = 0;
  while (s < newText.length && newText[s] === oldText[s]) s++;
  let e = 0;
  while (e < newText.length - s && e < oldText.length - s && newText[newText.length - 1 - e] === oldText[oldText.length - 1 - e]) e++;
  return { before: oldText.slice(Math.max(0, s - ctx), oldText.length - e + ctx), after: newText.slice(Math.max(0, s - ctx), newText.length - e + ctx) };
}

console.log(`# 최근 개정 · 신설 조문 (시행 ${ymd(SINCE)} 이후, 법제처 버전 비교)\n`);
for (const name of LAWS) {
  const vs = (await listStatuteVersions(name)).filter((v) => v.status !== "시행예정");
  const chain = vs.filter((v, i) => i === 0 || vs[i - 1].effective >= SINCE);
  const changes = [];
  for (let i = 0; i < chain.length - 1 && chain[i].effective >= SINCE; i++) {
    const [n, o] = await Promise.all([getStatuteArticlesAt(chain[i].mst, chain[i].effective), getStatuteArticlesAt(chain[i + 1].mst, chain[i + 1].effective)]);
    if (!n.ok || !o.ok) continue;
    const prev = new Map(o.articles.map((a) => [key(a), a]));
    for (const a of n.articles) {
      const b = prev.get(key(a));
      if (a.deleted || (b && norm(a.text) === norm(b.text))) continue;
      changes.push({ when: chain[i].effective, a, b: b && !b.deleted ? b : null });
    }
  }
  if (!changes.length) continue;
  console.log(`## ${name}\n`);
  for (const { when, a, b } of changes) {
    if (!b) {
      console.log(`- **[${ymd(when)} 신설] ${ref(a)}(${a.title})** — ${norm(a.text).slice(0, 300)}`);
      continue;
    }
    const d = diffSpan(norm(b.text), norm(a.text));
    console.log(`- **[${ymd(when)} 개정] ${ref(a)}(${a.title})**\n  - 전: …${d.before.slice(0, 400)}…\n  - 후: …${d.after.slice(0, 400)}…`);
  }
  console.log("");
}
