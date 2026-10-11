// 답변 한 덩어리를 문항별로 나눈다.
//
// 기업 담당자는 질문 8개를 한 번에 자기 AI에 넣고 답도 한 번에 받는다. 그걸 다시 여덟 칸에
// 손으로 나눠 넣게 하면 거기서 그만둔다 — 실제로 "0 / 8 답변 입력됨"에서 멈춘 화면을 봤다.
// 그래서 화면에는 붙여넣기 한 칸만 두고, 나누는 일은 서버가 한다.
//
// 나누는 순서:
//   1) "[답변 N]" 표시 — 질문을 복사할 때 "답변마다 [답변 N]을 붙여 달라"는 지시를 함께 넣는다.
//      AI의 답 안에 "1) 요건 2) 기간" 같은 목록이 있어도 헷갈리지 않는 유일한 표시다.
//   2) 표시가 없으면 모델에게 각 답변이 **시작하는 원문 조각**만 묻고, 원문을 그 자리에서 자른다.
//      답변 내용을 모델이 옮겨 쓰게 하지 않는다 — 남의 AI 답을 한 글자라도 바꾸면 채점이 틀어진다.
//   3) 그래도 안 되면 줄 맨 앞의 "1." "2." 번호로 자른다(예전 방식).
// 이 파일은 db도 모델도 부르지 않는다(모델 호출은 index.js가 주입한다).

// AI가 답 사이에 "[질문 2] …"를 다시 옮겨 적는 일이 흔하다. 그 반복은 답이 아니므로 잘라 낸다.
const clean = (s) =>
  String(s || "")
    .split(/\n[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[[【(]?\s*질문\s*\d{1,2}\s*[\]】)]/)[0]
    .replace(/^[\s*:：\-—]+/, "")
    .trim();

// 1) [답변 N] · 【답변 N】 · 답변 N: · ## 답변 N
export function splitByMarkers(raw, count) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const re = /(?:^|\n)[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[[【(]?\s*답변\s*(\d{1,2})\s*[\]】)]?(?:\*\*)?[ \t]*[:：.]?/g;
  const marks = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count && !marks.some((x) => x.n === n)) marks.push({ n, start: m.index, bodyAt: m.index + m[0].length });
  }
  if (!marks.length) return null;
  marks.sort((a, b) => a.start - b.start);
  const parts = {};
  marks.forEach((mk, i) => {
    const body = clean(text.slice(mk.bodyAt, i + 1 < marks.length ? marks[i + 1].start : text.length));
    if (body) parts[mk.n] = body;
  });
  return { parts, matched: Object.keys(parts).length };
}

// 3) 줄 맨 앞의 "1." "2)" "**3.**" — 1번부터 차례로 올라가는 번호만 쓴다.
export function splitNumbered(raw, count) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text || count < 1) return null;
  const marks = [];
  const re = /^[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?(\d{1,2})[.)．][ \t]*(?:\*\*)?(?=\S)/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) marks.push({ n: Number(m[1]), start: m.index, bodyAt: m.index + m[0].length });
  const seq = [];
  let want = 1;
  for (const mk of marks) {
    if (mk.n === want) { seq.push(mk); want += 1; }
    if (want > count) break;
  }
  if (seq.length < 2) return null;
  const parts = {};
  seq.forEach((mk, i) => {
    const body = clean(text.slice(mk.bodyAt, i + 1 < seq.length ? seq[i + 1].start : text.length));
    if (body) parts[mk.n] = body;
  });
  return { parts, matched: Object.keys(parts).length };
}

// 2) 모델이 알려 준 "각 답변의 첫 부분"을 원문에서 찾아 그 자리에서 자른다.
//    starts: { "1": "원문 그대로의 첫 부분", ... }. 원문에 없는 조각은 버린다.
export function cutAtStarts(raw, starts, count) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const squashIdx = (needle, from) => {
    const n = String(needle || "").trim();
    if (n.length < 6) return -1;
    // 앞부분 20자로 찾는다 — 모델이 뒤쪽을 조금 다르게 옮겨도 시작점은 맞는다.
    return text.indexOf(n.slice(0, 20), from);
  };
  const marks = [];
  let from = 0;
  for (let n = 1; n <= count; n++) {
    const at = squashIdx(starts?.[n] ?? starts?.[String(n)], from);
    if (at < 0) continue;
    marks.push({ n, start: at });
    from = at + 1;
  }
  if (!marks.length) return null;
  const parts = {};
  marks.forEach((mk, i) => {
    const body = clean(text.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : text.length));
    if (body) parts[mk.n] = body;
  });
  return { parts, matched: Object.keys(parts).length };
}

// 질문을 복사할 때 함께 넣는 지시. 이 형식이어야 1)번 방법으로 확실하게 나뉜다.
export function copyInstructions(probes) {
  const head =
    `아래 질문 ${probes.length}개에 차례로 답해 주세요. 각 답변 앞에 [답변 1], [답변 2]처럼 번호를 붙여 주세요.\n` +
    "질문마다 평소 사용자에게 답하듯 답하면 됩니다.";
  return `${head}\n\n${probes.map((p, i) => `[질문 ${i + 1}] ${p.question}`).join("\n\n")}`;
}
