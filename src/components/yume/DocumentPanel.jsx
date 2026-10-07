// 문서 검사 — 개발자 없는 기업 실무자가 쓰는 화면.
//
// 보도자료·상품 설명서·약관·보고서를 통째로 올리면(DOCX·HWPX·PDF·TXT 또는 붙여넣기),
// 유메가 문단 단위로 나눠 검사하고 원문에 틀린 곳을 표시한다. 기업이 결과를 받고 하는 일은
// 결국 "그 문장을 고치는 것"이라, 고친 문장을 반영한 본문을 바로 내려받게 한다.
//
// 과금은 계정의 API 한도(기업 요금제)에서 조각 수만큼 빠진다(server/documentsWeb.js).
// 회사 자료(기준 자료)를 함께 넣으면 자사 이야기는 그 자료와 먼저 대조한다.
import { useEffect, useRef, useState } from "react";
import { apiJson } from "./api.js";
import { t } from "../../i18n.js";

const UI = {
  ink: "#141118",
  ink2: "#54505E",
  ink3: "#8B8694",
  accent: "#5B3FA0",
  line: "rgba(20, 17, 24, 0.10)",
  soft: "#F5F2ED",
};

const VERDICT = {
  false: { label: "사실 아님", fg: "#B3312F", bg: "rgba(190,54,54,0.14)" },
  uncertain: { label: "확인 불가", fg: "#9A6B10", bg: "rgba(176,120,18,0.14)" },
  confirmed: { label: "확인됨", fg: "#2E7D56", bg: "rgba(46,125,86,0.12)" },
};

const ACCEPT = ".txt,.md,.csv,.docx,.hwpx,.pdf";
const MAX_FILE = 10 * 1024 * 1024;

const btn = (primary, disabled) => ({
  padding: "11px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer",
  border: primary ? "none" : `1px solid ${UI.line}`, background: primary ? UI.accent : "#fff",
  color: primary ? "#fff" : UI.ink2, opacity: disabled ? 0.5 : 1,
});
const field = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${UI.line}`, fontSize: 13.5,
  lineHeight: 1.6, fontFamily: "inherit", boxSizing: "border-box", color: UI.ink, background: "#fff",
};

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error(t("파일을 읽지 못했어요.")));
    r.readAsDataURL(file);
  });
}

function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// 원문을 주장 위치에 따라 조각내 표시한다. 겹치는 위치는 앞의 것만 칠한다.
function Annotated({ text, claims, active, onPick }) {
  const marks = claims
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.span && c.span.end > c.span.start)
    .sort((a, b) => a.c.span.start - b.c.span.start);
  const parts = [];
  let at = 0;
  for (const { c, i } of marks) {
    if (c.span.start < at) continue;
    if (c.span.start > at) parts.push(<span key={`t${at}`}>{text.slice(at, c.span.start)}</span>);
    const v = VERDICT[c.verdict] || VERDICT.uncertain;
    parts.push(
      <mark
        key={`m${i}`}
        onClick={() => onPick(i)}
        title={`${t(v.label)} — ${c.explanation || ""}`}
        style={{
          background: v.bg, color: UI.ink, borderRadius: 4, padding: "1px 2px", cursor: "pointer",
          boxShadow: active === i ? `0 0 0 2px ${v.fg}` : `inset 0 -2px 0 ${v.fg}`,
        }}
      >
        {text.slice(c.span.start, c.span.end)}
      </mark>,
    );
    at = c.span.end;
  }
  if (at < text.length) parts.push(<span key={`t${at}`}>{text.slice(at)}</span>);
  return (
    <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.85, color: UI.ink2, maxHeight: 420, overflowY: "auto", padding: "14px 16px", border: `1px solid ${UI.line}`, borderRadius: 12, background: "#fff" }}>
      {parts}
    </div>
  );
}

export default function DocumentPanel() {
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState(null);
  const [showRef, setShowRef] = useState(false);
  const [org, setOrg] = useState("");
  const [refText, setRefText] = useState("");
  const [strict, setStrict] = useState(false);
  const [job, setJob] = useState(null); // { id, parts }
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(null);
  const pollRef = useRef(0);

  const [recent, setRecent] = useState([]);

  useEffect(() => () => clearTimeout(pollRef.current), []);
  // 지난 문서. 창을 닫았다 다시 열어도, 다른 날이어도 결과를 다시 볼 수 있어야 한다.
  useEffect(() => {
    apiJson("/api/documents").then((d) => setRecent(d.documents || [])).catch(() => {});
  }, [job]);

  function openRecent(id) {
    clearTimeout(pollRef.current);
    setError("");
    setActive(null);
    setBusy(true);
    poll(id);
  }

  async function poll(id) {
    try {
      const d = await apiJson(`/api/documents/${id}`);
      if (d.status === "pending") {
        setDoc(d);
        pollRef.current = setTimeout(() => poll(id), 3000);
        return;
      }
      setBusy(false);
      // 조각이 전부 실패했으면 결과가 아니라 실패다. "주장이 없었다"로 보이면 안 된다.
      if (d.status === "error") {
        setDoc(null);
        setError(t("문서를 검사하지 못했어요. 잠시 후 다시 시도해 주세요. 사용한 한도는 차감되지 않았어요."));
        return;
      }
      setDoc(d);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function start() {
    setError("");
    setDoc(null);
    setActive(null);
    const body = {};
    if (file) {
      if (file.size > MAX_FILE) return setError(t("파일은 10MB까지 올릴 수 있어요."));
      body.file = { name: file.name, content_base64: await readAsBase64(file) };
    } else if (raw.trim()) body.text = raw;
    else return setError(t("검사할 글을 붙여 넣거나 파일을 올려 주세요."));
    if (org.trim()) body.organization = org.trim();
    if (strict) body.strict = true;
    if (refText.trim()) body.references = [{ title: t("회사 기준 자료"), text: refText.trim() }];
    setBusy(true);
    try {
      const r = await apiJson("/api/documents", { method: "POST", body });
      setJob(r);
      poll(r.id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const claims = doc?.result?.claims || [];
  const counts = doc?.result?.counts;
  const base = (doc?.title || t("문서")).replace(/\.[a-z0-9]+$/i, "");

  function downloadCsv() {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["순서", "판정", "원문", "주장", "근거", "고친 문장", "출처"];
    const body = claims.map((c, i) => [
      i + 1, VERDICT[c.verdict]?.label || c.verdict, c.quote || "", c.text, c.explanation || "", c.suggested_fix || "",
      (c.sources || []).map((s) => s.url || s.title).filter(Boolean).join(" "),
    ]);
    download(`${base}_유메_검사결과.csv`, "﻿" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  return (
    <div style={{ padding: "4px 2px" }}>
      <p style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.7, margin: "0 0 14px" }}>
        {t("보도자료·상품 설명서·약관·보고서를 통째로 검사합니다. 틀린 곳을 원문에 표시하고, 고친 문장을 반영한 본문을 내려받을 수 있어요. 파일은 DOCX·HWPX·PDF·TXT를 받아요.")}
      </p>

      {!file && (
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={t("검사할 문서를 붙여 넣으세요 (최대 10만 자)")}
          rows={8}
          disabled={busy}
          style={{ ...field, resize: "vertical" }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: UI.accent, cursor: busy ? "default" : "pointer" }}>
          {file ? t("다른 파일 고르기") : t("파일 올리기 (DOCX·HWPX·PDF·TXT)")}
          <input type="file" accept={ACCEPT} disabled={busy} style={{ display: "none" }} onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); }} />
        </label>
        {file && (
          <span style={{ fontSize: 13, color: UI.ink2 }}>
            {file.name} · {(file.size / 1024).toFixed(0)}KB{" "}
            {!busy && <button onClick={() => setFile(null)} style={{ border: "none", background: "none", color: UI.ink3, cursor: "pointer", fontSize: 12.5 }}>{t("빼기")}</button>}
          </span>
        )}
        <span style={{ fontSize: 12.5, color: UI.ink3 }}>{t("7천 자 안팎마다 1건으로 계산돼요")}</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={() => setShowRef((v) => !v)} style={{ border: "none", background: "none", padding: 0, color: UI.accent, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {showRef ? "▾ " : "▸ "}{t("우리 회사 기준 자료 함께 넣기 (선택)")}
        </button>
        {showRef && (
          <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: UI.soft }}>
            <div style={{ fontSize: 12.5, color: UI.ink2, lineHeight: 1.6, marginBottom: 8 }}>
              {t("회사 이름과 사실 자료(상품 정보, 요금, 회사 소개)를 넣으면, 자사에 관한 문장은 공개 웹이 아니라 이 자료와 먼저 대조해요. 자료는 저장하지 않아요.")}
            </div>
            <input value={org} onChange={(e) => setOrg(e.target.value)} disabled={busy} placeholder={t("회사 이름 (예: 리머)")} style={{ ...field, marginBottom: 8 }} />
            <textarea value={refText} onChange={(e) => setRefText(e.target.value)} disabled={busy} rows={4} placeholder={t("기준 자료 (최대 2만 자)")} style={{ ...field, resize: "vertical" }} />
          </div>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontSize: 13, color: UI.ink2, lineHeight: 1.55, cursor: "pointer" }}>
        <input type="checkbox" checked={strict} disabled={busy} onChange={(e) => setStrict(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <b style={{ color: UI.ink }}>{t("엄격 모드")}</b> — {t("근거 문장을 출처에서 직접 확인한 판정만 내립니다. 광고 심의·공시처럼 틀리면 안 되는 문서에 쓰세요.")}
        </span>
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={start} disabled={busy} style={btn(true, busy)}>
          {busy
            ? doc?.parts
              ? t("검사 중… {a} / {b}", { a: doc.parts.done + doc.parts.failed, b: doc.parts.total })
              : t("검사 준비 중…")
            : t("문서 검사 시작")}
        </button>
        {doc?.result && (
          <>
            <button onClick={() => download(`${base}_유메_고친본문.txt`, doc.result.corrected_text, "text/plain;charset=utf-8")} style={btn(false, false)}>
              {t("고친 본문 내려받기 ({n}곳 반영)", { n: doc.result.fixes_applied })}
            </button>
            <button onClick={downloadCsv} style={btn(false, false)}>{t("결과 CSV")}</button>
          </>
        )}
      </div>

      {error && <div style={{ marginTop: 12, fontSize: 13, color: VERDICT.false.fg, lineHeight: 1.6 }}>{error}</div>}
      {!busy && !doc && recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: UI.ink3, marginBottom: 6 }}>{t("최근 문서")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {recent.slice(0, 5).map((d) => (
              <button key={d.id} onClick={() => openRecent(d.id)} style={{ textAlign: "left", border: `1px solid ${UI.line}`, background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, color: UI.ink2 }}>
                <b style={{ color: UI.ink }}>{d.title || t("붙여 넣은 문서")}</b>
                <span style={{ marginLeft: 8, color: UI.ink3, fontSize: 12 }}>{new Date(Number(d.created_at)).toLocaleString()} · {Number(d.length).toLocaleString()}{t("자")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {job && busy && <div style={{ marginTop: 10, fontSize: 12.5, color: UI.ink3 }}>{t("문서를 {n}조각으로 나눠 검사하고 있어요. 이 창을 닫아도 계속 진행돼요.", { n: job.parts })}</div>}

      {doc?.result && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: 10 }}>
            <b style={{ fontSize: 15, color: UI.ink }}>{doc.result.verdict?.label}</b>
            <span style={{ fontSize: 13, color: UI.ink2 }}>
              {t("주장 {a}개 · 사실 아님 {b} · 확인 불가 {c} · 확인됨 {d}", { a: counts.claims, b: counts.false, c: counts.uncertain, d: counts.confirmed })}
            </span>
            {doc.status === "partial" && <span style={{ fontSize: 12.5, color: VERDICT.uncertain.fg }}>{t("일부 조각은 검사하지 못했어요({n}개).", { n: doc.parts.failed })}</span>}
          </div>

          <Annotated text={doc.text} claims={claims} active={active} onPick={setActive} />

          <div style={{ marginTop: 14, border: `1px solid ${UI.line}`, borderRadius: 12, overflow: "hidden" }}>
            {claims.map((c, i) => {
              const v = VERDICT[c.verdict] || VERDICT.uncertain;
              return (
                <div key={i} onClick={() => setActive(i)} style={{ padding: "12px 14px", borderTop: i ? `1px solid ${UI.line}` : "none", cursor: "pointer", background: active === i ? UI.soft : "#fff" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: v.bg, color: v.fg }}>{t(v.label)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: UI.ink, lineHeight: 1.55 }}>{c.text}</div>
                      {c.explanation && <div style={{ fontSize: 13, color: UI.ink2, lineHeight: 1.6, marginTop: 4 }}>{c.explanation}</div>}
                      {c.suggested_fix && (
                        <div style={{ fontSize: 13, color: "#1F7A52", lineHeight: 1.6, marginTop: 6 }}>
                          <b>{t("고친 문장")}:</b> {c.suggested_fix}
                        </div>
                      )}
                      {c.verified_via === "reference" && <div style={{ fontSize: 12, color: UI.accent, marginTop: 4 }}>{t("회사 기준 자료와 대조")}</div>}
                      {c.evidence?.status === "verified" && (
                        <div style={{ fontSize: 12, color: "#1F7A52", marginTop: 4 }}>
                          {t("근거 원문 확인")}: “{c.evidence.quote}”
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {!claims.length && <div style={{ padding: 14, fontSize: 13, color: UI.ink3 }}>{t("확인할 사실 주장이 없었어요")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
