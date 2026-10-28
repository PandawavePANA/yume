// 한국 법령 특화 세트의 조문 후보(2026-10-26) — 범용 모델이 감으로 읽기 쉬운 두 유형을 조문 저장소(engine/v2/statuteStore)에서 코드로 고른다.
//   penalty: 의무 조문과, 그 조문을 위반 대상으로 적은 벌칙 · 과태료 조문의 항 · 호(벌칙 지도). 정답 형량이 질문이 가리키는 조문이 아니라 다른 조문에 있다.
//   boundary: '미만' · '초과'(경계값 불포함)가 수치와 붙은 조문 줄. '이하' · '이상'과 헷갈리게 만드는 질문을 노린다.
// 출력은 trap-dataset.mjs의 candidates.jsonl 형식(+ type · instruction) — 그대로 --stage generate · test 에 넣는다.
//   railway run -s yume node scripts/korea-candidates.mjs --out "<폴더>"
import fs from "node:fs";
import path from "node:path";
import { loadStatute, articleLabel, lawUrl } from "../server/engine/v2/statuteStore.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith("--") ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const OUT = args.out;
fs.mkdirSync(OUT, { recursive: true });
const FIELDS = {
  노무: ["근로기준법", "고용보험법", "최저임금법", "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률", "근로자퇴직급여 보장법", "산업재해보상보험법", "기간제 및 단시간근로자 보호 등에 관한 법률", "파견근로자 보호 등에 관한 법률", "산업안전보건법", "직업안정법", "임금채권보장법"],
  법률: ["주택임대차보호법", "상가건물 임대차보호법", "전자상거래 등에서의 소비자보호에 관한 법률", "개인정보 보호법", "도로교통법", "할부거래에 관한 법률", "공인중개사법", "방문판매 등에 관한 법률", "약관의 규제에 관한 법률", "신용정보의 이용 및 보호에 관한 법률"],
  세무: ["국세기본법", "국세징수법", "소득세법", "부가가치세법", "조세특례제한법", "지방세법", "법인세법"],
  의료: ["의료법", "약사법", "국민건강보험법", "응급의료에 관한 법률", "감염병의 예방 및 관리에 관한 법률", "의료기기법", "마약류 관리에 관한 법률", "국민건강증진법"],
};
// --set new: 최종 시험용 — 기존 세트와 겹치지 않는 법령만(2026-10-26 엔진 3.0 최종 비교)
const NEW_FIELDS = {
  노무: ["노동조합 및 노동관계조정법", "근로자참여 및 협력증진에 관한 법률", "장애인고용촉진 및 직업재활법", "외국인근로자의 고용 등에 관한 법률", "고용상 연령차별금지 및 고령자고용촉진에 관한 법률", "근로복지기본법"],
  법률: ["주택법", "건축법", "부동산 거래신고 등에 관한 법률", "식품위생법", "정보통신망 이용촉진 및 정보보호 등에 관한 법률", "표시ㆍ광고의 공정화에 관한 법률"],
  세무: ["상속세 및 증여세법", "종합부동산세법", "지방세특례제한법", "개별소비세법", "인지세법", "부가가치세법"],
  의료: ["노인장기요양보험법", "혈액관리법", "장기등 이식에 관한 법률", "정신건강증진 및 정신질환자 복지서비스 지원에 관한 법률", "식품의약품안전처와 그 소속기관 직제", "의료급여법"],
};
// --set more: 데이터셋 500개 확장용(2026-10-26) — 앞 두 세트와 겹치지 않는 법령
const MORE_FIELDS = {
  노무: ["선원법", "건설근로자의 고용개선 등에 관한 법률", "청소년 보호법", "가사근로자의 고용개선 등에 관한 법률", "중대재해 처벌 등에 관한 법률", "국민연금법"],
  법률: ["자동차관리법", "여객자동차 운수사업법", "공중위생관리법", "학원의 설립ㆍ운영 및 과외교습에 관한 법률", "옥외광고물 등의 관리와 옥외광고산업 진흥에 관한 법률", "가맹사업거래의 공정화에 관한 법률", "대규모유통업에서의 거래 공정화에 관한 법률", "하도급거래 공정화에 관한 법률"],
  세무: ["교통ㆍ에너지ㆍ환경세법", "주세법", "증권거래세법", "농어촌특별세법", "관세법", "국제조세조정에 관한 법률"],
  의료: ["건강기능식품에 관한 법률", "화장품법", "의료기사 등에 관한 법률", "보건범죄 단속에 관한 특별조치법", "결핵예방법", "모자보건법", "생명윤리 및 안전에 관한 법률"],
};
// --set fresh: 엔진 3.0 개선 뒤 최종 공정 비교용(2026-10-26 밤) — 앞 세 세트와 겹치지 않고, 엔진을 고칠 때 한 번도 보지 않은 법령
const FRESH_FIELDS = {
  노무: ["근로자직업능력 개발법", "고용정책 기본법", "진폐의 예방과 진폐근로자의 보호 등에 관한 법률", "어선원 및 어선 재해보상보험법", "공인노무사법", "사회보장기본법"],
  법률: ["전자금융거래법", "부정경쟁방지 및 영업비밀보호에 관한 법률", "소비자기본법", "제조물 책임법", "게임산업진흥에 관한 법률", "택시운송사업의 발전에 관한 법률", "물류정책기본법"],
  세무: ["지방세징수법", "지방세기본법", "세무사법", "관세사법", "조세범 처벌법"],
  의료: ["간호법", "수의사법", "보건의료기본법", "구강보건법", "치매관리법", "첨단재생의료 및 첨단바이오의약품 안전 및 지원에 관한 법률", "실험동물에 관한 법률"],
};
// --set fresh2: 2차 공정 비교(2026-10-27) — fresh 결과를 보고 엔진을 고쳤으니, 다시 아무도 안 본 법령으로
const FRESH2_FIELDS = {
  노무: ["고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률", "청년고용촉진 특별법", "항만운송사업법", "장애인차별금지 및 권리구제 등에 관한 법률"],
  법률: ["건설산업기본법", "자동차손해배상 보장법", "대부업 등의 등록 및 금융이용자 보호에 관한 법률", "전기통신사업법", "위치정보의 보호 및 이용 등에 관한 법률"],
  세무: ["교육세법", "부동산 가격공시에 관한 법률", "자유무역협정의 이행을 위한 관세법의 특례에 관한 법률", "수출용 원재료에 대한 관세 등 환급에 관한 특례법"],
  의료: ["의료사고 피해구제 및 의료분쟁 조정 등에 관한 법률", "후천성면역결핍증 예방법", "호스피스ㆍ완화의료 및 임종과정에 있는 환자의 연명의료결정에 관한 법률", "인체조직안전 및 관리 등에 관한 법률"],
};
const SET = args.set === "new" ? NEW_FIELDS : args.set === "more" ? MORE_FIELDS : args.set === "fresh" ? FRESH_FIELDS : args.set === "fresh2" ? FRESH2_FIELDS : FIELDS;
const PER_LAW = Number(args.per || 2);
const ONLY = args.only || ""; // penalty | boundary — 한 유형만(벌칙 연결이 Sonnet을 가장 잘 틀리게 함: 남김률 48% vs 경계 26%)
// --skip "<a.jsonl>,<b.jsonl>": 앞 세트에서 이미 쓴 벌칙 조문은 다시 고르지 않는다
const SKIP = new Set(String(args.skip || "").split(",").filter(Boolean).flatMap((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((c) => `${c.law}|${c.article}`) : [])));
const file = path.join(OUT, "candidates.jsonl");
fs.writeFileSync(file, "");
let n = 0;
const write = (o) => fs.appendFileSync(file, `${JSON.stringify(o)}\n`);
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

for (const [field, laws] of Object.entries(SET)) {
  for (const name of laws) {
    const s = await loadStatute(name).catch(() => null);
    if (!s) { console.log(`  [건너뜀] ${name}`); continue; }
    // penalty — 수치가 있는 제재 + 위반 대상 조문이 하나뿐인 항목(정답이 하나로 정해지게)
    const pens = shuffle(s.penalties.filter((p) => p.refs.length === 1 && /\d/.test(p.sanction)));
    for (const p of ONLY === "boundary" ? [] : pens.filter((x) => !SKIP.has(`${s.law}|${articleLabel(x.no, x.branch)}`)).slice(0, PER_LAW)) {
      const duty = s.articles.find((a) => a.no === p.refs[0].no && (a.branch || 0) === (p.refs[0].branch || 0));
      if (!duty || duty.deleted || /효력 상실/.test(duty.text) || /효력 상실/.test(s.articles.find((a) => a.no === p.no && (a.branch || 0) === p.branch)?.text || "")) continue;
      n += 1;
      const text = `[의무 조문] ${s.law} ${articleLabel(duty.no, duty.branch)}(${duty.title})\n${String(duty.text).slice(0, 900)}\n\n[벌칙 조문] ${s.law} ${articleLabel(p.no, p.branch)}(${p.title})\n${p.text}`;
      write({ cid: `K${String(n).padStart(4, "0")}`, field, type: "penalty", law: s.law, article: articleLabel(p.no, p.branch), no: p.no, branch: p.branch, title: p.title, effective: s.effective, url: lawUrl(s.law, p.no, p.branch), text,
        instruction: `${articleLabel(duty.no, duty.branch)}(${duty.title})를 위반했을 때의 처벌을 묻는 질문을 만든다. 질문에는 의무 조문의 내용(무엇을 하지 않으면)만 넣고 벌칙 조문 번호는 넣지 않는다. 그럴듯하지만 틀린 형량 · 벌금 상한 · 제재 종류(벌금↔과태료)를 전제로 넣는다. 정답은 [벌칙 조문]의 제재 문구 "${p.sanction}"이다. answer_quote는 [벌칙 조문]에서 옮긴다.` });
    }
    // boundary — '미만' · '초과'가 수치에 붙은 줄
    const lines = s.articles.filter((a) => !a.deleted && !/벌칙|과태료/.test(a.title || "") && !/효력 상실/.test(a.text || "")).flatMap((a) => String(a.text).split("\n").map((l) => ({ a, l }))).filter((x) => /\d[\d,]*\s*(?:명|인|%|퍼센트|원|만원|일|개월|년|세|시간|회)\s*(?:미만|초과)/.test(x.l) && x.l.length < 400);
    for (const { a, l } of ONLY === "penalty" ? [] : shuffle(lines).slice(0, PER_LAW)) {
      n += 1;
      write({ cid: `K${String(n).padStart(4, "0")}`, field, type: "boundary", law: s.law, article: articleLabel(a.no, a.branch), no: a.no, branch: a.branch || 0, title: a.title, effective: s.effective, url: lawUrl(s.law, a.no, a.branch), text: a.text,
        instruction: `이 줄의 경계 표현을 노리는 질문을 만든다: "${l.slice(0, 200)}". 경계값 바로 그 수치(예: 기준이 '30명 미만'이면 정확히 30명)를 예로 들어, '미만 · 초과'를 '이하 · 이상'으로 잘못 아는 전제를 넣는다. 정답은 경계값이 포함되는지 여부와 그 결과다.` });
    }
    console.log(`  ${field} ${s.law}: 벌칙 ${pens.length} · 경계 ${Math.min(PER_LAW, lines.length)}`);
  }
}
console.log(`후보 ${n}개 → ${file}`);
