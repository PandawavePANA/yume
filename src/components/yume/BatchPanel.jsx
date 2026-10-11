// 일괄 검증 — 개발자 없이 여러 건을 한 번에 확인하는 화면.
//
// /v1/verify/batch는 API라서 고객사에 개발자가 있어야 쓴다. 그런데 도입을 결정하는 쪽은
// 대개 담당자고, 그 사람이 가진 건 엑셀 한 장이다. 그래서 같은 일을 화면에서 하게 둔다.
//
// 새 과금 경로를 만들지 않는다. 항목마다 기존 /api/verify를 그대로 부른다 — 크레딧 차감,
// 하루 한도, 본인확인, 비용 상한이 전부 이미 그 길에 붙어 있다. 묶음용으로 따로 만들면
// 그 장치들을 한 번 더 구현해야 하고, 돈이 걸린 코드를 두 벌 두면 언젠가 어긋난다.
//
// 한 건씩 차례로 돈다. 동시에 던지면 분당 한도에 걸리고 하루 AI 비용 상한을 한 번에 태운다.
// 대신 몇 번째를 하고 있는지 계속 보여 주고, 중간에 멈춰도 그때까지의 결과를 내려받게 한다.
import { useRef, useState } from "react";
import { t } from "../../i18n.js";
import { trackingHeaders } from "../../tracking.js";

const CHARS_PER_CREDIT = 2000;

const UI = {
  ink: "#141118",
  ink2: "#54505E",
  ink3: "#8B8694",
  accent: "#5B3FA0",
  line: "rgba(20, 17, 24, 0.10)",
  soft: "#F5F2ED",
};

const VERDICT = {
  false: { label: "사실 아님", fg: "#B3312F", bg: "rgba(190,54,54,0.10)" },
  uncertain: { label: "확인 불가", fg: "#9A6B10", bg: "rgba(176,120,18,0.10)" },
  confirmed: { label: "확인됨", fg: "#2E7D56", bg: "rgba(46,125,86,0.10)" },
};

/** 붙여넣은 글을 항목으로 나눈다. 빈 줄이 있으면 문단 단위, 없으면 줄 단위. */
export function splitItems(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const byBlank = text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** CSV 한 줄을 칸으로 나눈다(따옴표 안의 쉼표·줄바꿈 처리). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const s = String(text || "").replace(/\r\n/g, "\n");
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** 표에서 검증할 칸을 고른다 — 글자가 가장 긴 칸이 본문일 가능성이 높다. */
export function pickTextColumn(rows) {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((r) => r.length));
  if (width === 1) return rows.map((r) => r[0].trim()).filter(Boolean);
  const avg = [];
  for (let c = 0; c < width; c += 1) {
    const lens = rows.map((r) => (r[c] || "").trim().length);
    avg[c] = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  }
  const best = avg.indexOf(Math.max(...avg));
  const picked = rows.map((r) => (r[best] || "").trim()).filter(Boolean);
  // 첫 줄이 "내용", "답변" 같은 머리글이면 뺀다.
  if (picked.length > 1 && picked[0].length <= 12) picked.shift();
  return picked;
}

/** /api/verify를 한 번 부르고 결과만 돌려준다. 진행 메시지는 흘려보낸다. */
async function verifyOne(text, signal) {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...trackingHeaders() },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) {
    const parsed = await res.json().catch(() => ({}));
    const err = new Error(parsed.error || t("서버 오류가 발생했습니다."));
    err.limitReached = res.status === 402 && !!parsed.limitReached;
    err.identityRequired = res.status === 403 && parsed.code === "IDENTITY_REQUIRED";
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let serverError = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop();
    for (const chunk of chunks) {
      const ev = chunk.split("\n").find((l) => l.startsWith("event: "));
      const dt = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!ev || !dt) continue;
      const data = JSON.parse(dt.slice("data: ".length));
      if (ev.slice("event: ".length) === "result") result = data;
      else if (ev.slice("event: ".length) === "error") serverError = data.error;
    }
  }
  if (serverError) throw new Error(serverError);
  return result;
}

/** 판정 하나로 줄인다 — 하나라도 "사실 아님"이면 그것이 이 건의 결론이다. */
function summarize(result) {
  const claims = result?.claims || [];
  if (claims.length === 0) return { verdict: "none", bad: 0, total: 0 };
  const bad = claims.filter((c) => c.verdict === "false").length;
  const unsure = claims.filter((c) => c.verdict === "uncertain").length;
  return { verdict: bad > 0 ? "false" : unsure > 0 ? "uncertain" : "confirmed", bad, unsure, total: claims.length };
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function BatchPanel({ onClose }) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [notice, setNotice] = useState("");
  const abortRef = useRef(null);

  const items = splitItems(raw);
  const credits = items.reduce((sum, it) => sum + Math.max(1, Math.ceil(it.length / CHARS_PER_CREDIT)), 0);

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const picked = /\.csv$/i.test(file.name) ? pickTextColumn(parseCsv(text)) : splitItems(text);
      setRaw(picked.join("\n\n"));
      setNotice(t("{n}개 항목을 읽었어요. 아래에서 확인하고 시작하세요.", { n: picked.length }));
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  async function run() {
    if (!items.length || running) return;
    setRunning(true);
    setNotice("");
    setRows([]);
    setDoneCount(0);
    const controller = new AbortController();
    abortRef.current = controller;
    const out = [];
    for (let i = 0; i < items.length; i += 1) {
      if (controller.signal.aborted) break;
      try {
        const result = await verifyOne(items[i], controller.signal);
        out.push({ n: i + 1, text: items[i], ...summarize(result), claims: result?.claims || [], summary: result?.summary || "" });
      } catch (e) {
        if (controller.signal.aborted) break;
        out.push({ n: i + 1, text: items[i], verdict: "error", error: e.message });
        // 한도에 걸리면 남은 항목도 전부 같은 이유로 실패한다. 거기서 멈추는 게 맞다.
        if (e.limitReached || e.identityRequired) {
          setRows([...out]);
          setDoneCount(out.length);
          setNotice(t("{n}번째에서 멈췄어요: {m}", { n: i + 1, m: e.message }));
          setRunning(false);
          abortRef.current = null;
          return;
        }
      }
      setRows([...out]);
      setDoneCount(out.length);
    }
    setRunning(false);
    abortRef.current = null;
    if (!controller.signal.aborted) setNotice(t("{n}건을 모두 확인했어요.", { n: out.length }));
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setNotice(t("멈췄어요. 그때까지의 결과는 내려받을 수 있어요."));
  }

  function download() {
    // 고칠 부분: 사실과 다른 문장과, 근거의 실제 값으로 고친 문장. 엑셀에서 그대로 보고 고치게 한다.
    const fixes = (claims = []) => claims
      .filter((c) => c.verdict === "false")
      .map((c) => `${c.quote || c.text}${c.suggested_fix ? ` → ${c.suggested_fix}` : ` (${c.explanation || ""})`}`)
      .join("\n");
    const head = ["번호", "입력", "판정", "주장 수", "사실 아님", "확인 불가", "고칠 부분", "요약"];
    const body = rows.map((r) => [
      r.n, r.text, r.verdict === "error" ? `오류: ${r.error}` : (VERDICT[r.verdict]?.label || "주장 없음"),
      r.total ?? 0, r.bad ?? 0, r.unsure ?? 0, fixes(r.claims), r.summary || "",
    ]);
    // 엑셀이 UTF-8을 알아보게 BOM을 붙인다. 없으면 한글이 깨져 열린다.
    const csv = "﻿" + [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `유메_일괄검증_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const badTotal = rows.filter((r) => r.verdict === "false").length;

  return (
    <div style={{ padding: "4px 2px" }}>
      <p style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.7, margin: "0 0 14px" }}>
        {t("여러 건을 한 번에 확인합니다. 한 줄에 하나씩 넣거나, 빈 줄로 나눠 넣으세요. CSV 파일을 올리면 가장 긴 칸을 본문으로 읽습니다.")}
      </p>

      <textarea
        id="batch-input"
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setNotice(""); }}
        placeholder={t("확인할 내용을 넣으세요. 예: 상담 답변, 상품 설명, 보도자료 문단")}
        rows={7}
        disabled={running}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.6,
          border: `1px solid ${UI.line}`, background: "#fff", color: UI.ink, fontFamily: "inherit",
          boxSizing: "border-box", resize: "vertical",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: UI.accent, cursor: "pointer" }}>
          {t("CSV·텍스트 파일 올리기")}
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} disabled={running} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: 12.5, color: UI.ink3 }}>
          {items.length > 0
            ? t("항목 {n}개 · 약 {c}크레딧", { n: items.length, c: credits })
            : t("아직 넣은 내용이 없어요")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button
          onClick={run}
          disabled={!items.length || running}
          style={{
            padding: "11px 20px", borderRadius: 999, border: "none", cursor: items.length && !running ? "pointer" : "default",
            background: UI.accent, color: "#fff", fontSize: 14, fontWeight: 600, opacity: items.length && !running ? 1 : 0.5,
          }}
        >
          {running ? t("확인 중… {a} / {b}", { a: doneCount, b: items.length }) : t("{n}건 확인 시작", { n: items.length })}
        </button>
        {running && (
          <button onClick={stop} style={{ padding: "11px 18px", borderRadius: 999, border: `1px solid ${UI.line}`, background: "#fff", color: UI.ink2, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            {t("멈추기")}
          </button>
        )}
        {rows.length > 0 && !running && (
          <button onClick={download} style={{ padding: "11px 18px", borderRadius: 999, border: `1px solid ${UI.line}`, background: "#fff", color: UI.ink2, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            {t("결과 CSV 내려받기")}
          </button>
        )}
        {onClose && !running && (
          <button onClick={onClose} style={{ padding: "11px 18px", borderRadius: 999, border: "none", background: "transparent", color: UI.ink3, fontSize: 13.5, cursor: "pointer" }}>
            {t("닫기")}
          </button>
        )}
      </div>

      {notice && <div style={{ marginTop: 12, fontSize: 13, color: UI.ink2, lineHeight: 1.6 }}>{notice}</div>}

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 22, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: UI.ink2 }}>
            <span>{t("확인 {n}건", { n: rows.length })}</span>
            {badTotal > 0 && <span style={{ color: VERDICT.false.fg, fontWeight: 700 }}>{t("사실 아님 {n}건", { n: badTotal })}</span>}
          </div>

          <div style={{ marginTop: 10, border: `1px solid ${UI.line}`, borderRadius: 12, overflow: "hidden" }}>
            {rows.map((r) => {
              const v = VERDICT[r.verdict];
              return (
                <div key={r.n} style={{ display: "flex", gap: 12, padding: "12px 14px", borderTop: r.n === 1 ? "none" : `1px solid ${UI.line}`, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 12.5, color: UI.ink3, minWidth: 22, fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: UI.ink, lineHeight: 1.6, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {r.text}
                    </div>
                    {r.verdict === "error" ? (
                      <div style={{ fontSize: 12.5, color: VERDICT.false.fg, marginTop: 4 }}>{r.error}</div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 4 }}>
                        {r.total > 0
                          ? t("주장 {t}개 · 사실 아님 {b} · 확인 불가 {u}", { t: r.total, b: r.bad, u: r.unsure })
                          : t("확인할 사실 주장이 없었어요")}
                      </div>
                    )}
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                    background: v ? v.bg : UI.soft, color: v ? v.fg : UI.ink3,
                  }}>
                    {r.verdict === "error" ? t("오류") : (v?.label || t("주장 없음"))}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
