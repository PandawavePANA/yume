// 무료 할루시네이션 점검 — B2B 진입 화면.
//
// 자격 증명을 받지 않는 게 이 화면의 설계 전제다. 무료 진단을 받자고 사내 AI의 API 키를
// 넘길 기업은 없다. 그래서 두 단계로 나눈다 — 유메가 문항을 주고, 기업이 자기 AI에
// 넣어본 답변을 붙여넣는다. 붙여넣기가 번거로우니 문항 복사를 최대한 쉽게 만든다.
import { useState } from "react";
import { copyText } from "../../clipboard.js";
import { apiJson, apiUrl, safeUrl } from "./api.js";

const UI = {
  ink: "#1D1A24",
  ink2: "#5E5870",
  ink3: "#9A93AC",
  accent: "#6B4FA8",
  hairline: "rgba(60, 40, 110, 0.10)",
  backdrop: "rgba(24, 16, 44, 0.32)",
};

const BAND = {
  low: { fg: "#1F7A52", bg: "#E7F6EE", border: "#B7E4CC" },
  moderate: { fg: "#8A5A14", bg: "#FDF4E3", border: "#F0D98C" },
  elevated: { fg: "#B23B2B", bg: "#FDEFEC", border: "#EFC2B6" },
  severe: { fg: "#93261A", bg: "#FBE4E0", border: "#E8A99C" },
  insufficient: { fg: "#5E5870", bg: "#F4F3F7", border: "#DCD9E4" },
};
const MARK = {
  hallucinated: { glyph: "✕", fg: "#C6402F", label: "할루시네이션" },
  partial: { glyph: "△", fg: "#8A5A14", label: "부분 실패" },
  safe: { glyph: "✓", fg: "#1F9D66", label: "정상" },
  ungraded: { glyph: "?", fg: "#6A6E76", label: "채점 불가" },
};

const DOMAINS = [
  ["법률", "로펌·법무팀·법률 상담"],
  ["의료", "병원·제약·헬스케어"],
  ["금융", "은행·증권·핀테크"],
  ["일반", "그 외 모든 분야"],
];

const field = {
  width: "100%", padding: "11px 14px", borderRadius: 12, fontSize: 14,
  border: `1px solid ${UI.hairline}`, background: "#fff", color: UI.ink,
  fontFamily: "inherit", boxSizing: "border-box",
};
const primaryBtn = {
  padding: "12px 22px", borderRadius: 999, border: "none", background: UI.accent,
  color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: "pointer",
};
const ghostBtn = {
  padding: "7px 13px", borderRadius: 999, border: `1px solid ${UI.hairline}`,
  background: "#fff", color: UI.ink2, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

export default function AuditModal({ onClose }) {
  const [step, setStep] = useState("intro"); // intro | answer | result
  const [domain, setDomain] = useState("법률");
  const [subject, setSubject] = useState("");
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function issue() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/audit/probes", { method: "POST", body: { domain, subject, size: 8 } });
      setSession(data);
      setAnswers({});
      setStep("answer");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function grade() {
    setBusy(true);
    setError("");
    try {
      const data = await apiJson("/api/audit/grade", {
        method: "POST",
        body: { session_id: session.session_id, subject, answers },
      });
      setReport(data);
      setStep("result");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text, key) {
    if (await copyText(text)) {
      setError("");
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } else {
      setError("이 브라우저에서는 복사가 막혀 있어요. 질문을 길게 눌러 직접 복사해주세요.");
    }
  }

  const filled = session ? session.probes.filter((p) => String(answers[p.id] || "").trim()).length : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: UI.backdrop, display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 60,
        backdropFilter: "blur(14px) saturate(140%)", WebkitBackdropFilter: "blur(14px) saturate(140%)",
        padding: "calc(20px + var(--yume-safe-top)) 20px calc(20px + var(--yume-safe-bottom))",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "88vh", overflowY: "auto", background: "#fff",
          borderRadius: 28, padding: "clamp(22px, 4vw, 40px)", boxShadow: "0 40px 100px rgba(24,16,44,0.28)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: UI.ink3, textTransform: "uppercase" }}>무료 점검</div>
            <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.03em", color: UI.ink, margin: "8px 0 0" }}>
              우리 회사 AI, 거짓말을 할까?
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, border: "none", background: "rgba(118,118,128,0.12)", color: UI.ink2, fontSize: 16, cursor: "pointer" }}
          >×</button>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 16, padding: "12px 15px", borderRadius: 12, background: "#FDEFEC", border: "1px solid #EFC2B6", color: "#93261A", fontSize: 13.5 }}>
            {error}
          </div>
        )}

        {step === "intro" && (
          <Intro
            domain={domain} setDomain={setDomain}
            subject={subject} setSubject={setSubject}
            busy={busy} onStart={issue}
          />
        )}

        {step === "answer" && session && (
          <AnswerStep
            session={session} answers={answers} setAnswers={setAnswers}
            filled={filled} busy={busy} onGrade={grade}
            copy={copy} copied={copied}
            onBack={() => setStep("intro")}
          />
        )}

        {step === "result" && report && <Result report={report} onRestart={() => setStep("intro")} />}
      </div>
    </div>
  );
}

function Intro({ domain, setDomain, subject, setSubject, busy, onStart }) {
  return (
    <>
      <p style={{ fontSize: 15, color: UI.ink2, lineHeight: 1.65, marginTop: 14 }}>
        유메가 <b>정답을 미리 아는 질문</b> 8개를 만들어 드립니다. 귀사에서 쓰는 AI에 그대로 넣어보고
        답변을 붙여넣으면, 지어낸 답이 얼마나 나오는지 채점해 드립니다. <b>가입도, API 키도 필요 없습니다.</b>
      </p>

      <div style={{ marginTop: 18, padding: "16px 18px", borderRadius: 16, background: "#FBFAFD", border: `1px solid ${UI.hairline}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, marginBottom: 8 }}>질문은 이렇게 만듭니다</div>
        <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.7 }}>
          예를 들어 “민법 제9999조를 설명해주세요” 같은 질문입니다. 짐작해서 내는 게 아니라
          <b> 법제처 국가법령정보에서 민법 마지막 조문 번호를 확인한 뒤</b> 그보다 큰 번호를 고릅니다.
          존재하지 않는 게 확정된 상태라, 설명을 지어내면 그 자리에서 잡힙니다.
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: UI.ink, display: "block", marginBottom: 9 }}>어떤 분야의 AI인가요?</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {DOMAINS.map(([d, hint]) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                border: `1px solid ${domain === d ? UI.accent : UI.hairline}`,
                background: domain === d ? "rgba(139,111,216,0.08)" : "#fff",
              }}
            >
              <div style={{ fontSize: 14.5, fontWeight: 600, color: domain === d ? UI.accent : UI.ink }}>{d}</div>
              <div style={{ fontSize: 12, color: UI.ink3, marginTop: 2 }}>{hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label htmlFor="audit-subject" style={{ fontSize: 13, fontWeight: 600, color: UI.ink, display: "block", marginBottom: 8 }}>
          점검 대상 이름 <span style={{ fontWeight: 400, color: UI.ink3 }}>(선택 — 리포트에 표시됩니다)</span>
        </label>
        <input
          id="audit-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="예: ○○ 로펌 사내 법률 assistant" maxLength={120} style={field}
        />
      </div>

      <button onClick={onStart} disabled={busy} style={{ ...primaryBtn, marginTop: 22, opacity: busy ? 0.6 : 1 }}>
        {busy ? "문항 만드는 중…" : "질문 8개 받기"}
      </button>
      <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 12, lineHeight: 1.6 }}>
        문항은 공식 데이터베이스를 조회해 매번 새로 만듭니다. 같은 질문이 반복되지 않아 미리 대비할 수 없습니다.
      </div>
    </>
  );
}

function AnswerStep({ session, answers, setAnswers, filled, busy, onGrade, copy, copied, onBack }) {
  const allText = session.probes.map((p, i) => `${i + 1}. ${p.question}`).join("\n\n");
  return (
    <>
      <p style={{ fontSize: 14.5, color: UI.ink2, lineHeight: 1.65, marginTop: 14 }}>{session.instructions}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => copy(allText, "all")} style={ghostBtn}>
          {copied === "all" ? "복사됐습니다" : "질문 전체 복사"}
        </button>
        <span style={{ fontSize: 13, color: UI.ink3 }}>
          {filled} / {session.probes.length} 답변 입력됨
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        {session.probes.map((p, i) => (
          <div key={p.id} style={{ padding: "16px 18px", borderRadius: 16, background: "#FBFAFD", border: `1px solid ${UI.hairline}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: UI.ink, lineHeight: 1.6 }}>
                <span style={{ color: UI.ink3, marginRight: 7 }}>{i + 1}.</span>{p.question}
              </div>
              <button onClick={() => copy(p.question, p.id)} style={{ ...ghostBtn, flexShrink: 0 }}>
                {copied === p.id ? "복사됨" : "복사"}
              </button>
            </div>
            <textarea
              id={`audit-answer-${p.id}`}
              value={answers[p.id] || ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
              placeholder="AI가 준 답변을 그대로 붙여넣으세요"
              rows={3}
              style={{ ...field, marginTop: 11, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
        <button onClick={onGrade} disabled={busy || filled === 0} style={{ ...primaryBtn, opacity: busy || filled === 0 ? 0.5 : 1 }}>
          {busy ? "채점 중… (1분쯤 걸립니다)" : `답변 ${filled}개 채점하기`}
        </button>
        <button onClick={onBack} disabled={busy} style={{ ...ghostBtn, padding: "12px 18px", fontSize: 14 }}>처음으로</button>
      </div>
      <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 12, lineHeight: 1.6 }}>
        답변을 다듬거나 요약하지 마시고 원문 그대로 넣어주셔야 정확하게 채점됩니다.
        일부만 채워도 채점되지만, 문항이 적을수록 결과의 신뢰구간이 넓어집니다.
      </div>
    </>
  );
}

function Result({ report, onRestart }) {
  const s = report.score;
  const band = BAND[s.band] || BAND.moderate;
  const rec = report.recommendation;

  return (
    <>
      <div style={{ marginTop: 18, padding: 22, borderRadius: 18, background: band.bg, border: `1px solid ${band.border}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 44, fontWeight: 700, color: band.fg, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.index}</b>
          <span style={{ fontSize: 15, color: band.fg }}>/ 100</span>
          <span style={{ background: band.fg, color: "#fff", borderRadius: 999, padding: "3px 12px", fontSize: 13, fontWeight: 600 }}>{s.bandLabel}</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: band.fg, lineHeight: 1.5 }}>{s.headline}</div>
        <div style={{ marginTop: 10, fontSize: 13.5, color: UI.ink2 }}>
          문항 {s.graded}개 채점{s.ungraded ? ` (${s.ungraded}개 채점 불가)` : ""} · 95% 신뢰구간 {s.interval.low}% ~ {s.interval.high}%
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${band.border}`, fontSize: 12.5, color: UI.ink2, lineHeight: 1.6 }}>
          {s.caveat}
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, marginTop: 26, marginBottom: 10 }}>유형별 결과</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {Object.entries(s.byType).map(([type, v]) => {
          const meta = report.method.types[type] || {};
          return (
            <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 15px", borderRadius: 13, background: "#FBFAFD", border: `1px solid ${UI.hairline}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: UI.ink }}>{meta.label || type}</div>
                <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 2 }}>{meta.meaning || ""}</div>
              </div>
              <div style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: v.failed > 0 ? "#C6402F" : "#1F9D66", fontVariantNumeric: "tabular-nums" }}>
                {v.failed} / {v.total}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink, marginTop: 26, marginBottom: 10 }}>문항별 기록</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {report.results.map((r) => <ResultItem key={r.probeId} r={r} />)}
      </div>

      {rec.recommend ? (
        <div style={{ marginTop: 24, padding: 22, borderRadius: 18, background: "#1F1B2E", color: "#fff" }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 8 }}>이 결과를 두고 드리는 제안</div>
          <p style={{ margin: 0, fontSize: 14.5, color: "#CFC9DE", lineHeight: 1.65 }}>{rec.reason}</p>
          <p style={{ margin: "10px 0 0", fontSize: 14.5, color: "#CFC9DE", lineHeight: 1.65 }}>{rec.fit}</p>
          <a href={apiUrl("/docs/api")} target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 16, background: UI.accent, color: "#fff", textDecoration: "none", borderRadius: 999, padding: "11px 22px", fontWeight: 600, fontSize: 14.5 }}>
            유메 API 문서 보기 →
          </a>
        </div>
      ) : (
        <div style={{ marginTop: 24, padding: 20, borderRadius: 16, background: "#FBFAFD", border: `1px solid ${UI.hairline}`, color: UI.ink2 }}>
          <b style={{ color: UI.ink }}>이번 점검에서는 유메를 권하지 않습니다.</b>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.65 }}>{rec.reason}</p>
          {rec.note && <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.65 }}>{rec.note}</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
        {report.report_url && (
          <a href={apiUrl(report.report_url)} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: "none", display: "inline-block" }}>
            리포트 링크 열기
          </a>
        )}
        <button onClick={onRestart} style={{ ...ghostBtn, padding: "12px 18px", fontSize: 14 }}>다시 점검하기</button>
      </div>
      {report.report_url && (
        <div style={{ fontSize: 12.5, color: UI.ink3, marginTop: 10, lineHeight: 1.6 }}>
          리포트 링크는 7일간 유지됩니다. 검색에 노출되지 않으니 사내에 공유하셔도 됩니다.
        </div>
      )}
    </>
  );
}

// 문항 하나. 판정만 보여주면 "그래서 뭐가 틀렸는데?"에서 설득이 멈춘다. AI가 한 말과
// 공식 확인 결과를 나란히 놓고, 어긋난 지점과 원 출처 링크를 함께 보여준다.
// explain이 없는 예전 리포트도 깨지지 않게 evidence·reason으로 돌아간다.
function ResultItem({ r }) {
  const m = MARK[r.outcome] || MARK.ungraded;
  const x = r.explain || { aiSaid: r.evidence, quote: r.evidence, fact: r.groundTruth, why: r.reason };
  const failed = r.outcome === "hallucinated" || r.outcome === "partial";
  const sourceHref = safeUrl(x.source?.url);
  const box = (bg, border) => ({ flex: "1 1 240px", minWidth: 0, padding: "12px 14px", borderRadius: 12, background: bg, border: `1px solid ${border}` });
  const cap = { fontSize: 11.5, fontWeight: 700, letterSpacing: "0.02em", marginBottom: 6 };

  return (
    <div style={{ padding: "16px 18px", borderRadius: 16, background: "#fff", border: `1px solid ${failed ? m.fg + "40" : UI.hairline}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ color: m.fg, fontWeight: 700 }}>{m.glyph}</span>
        <span style={{ fontSize: 12, color: UI.ink3 }}>{r.typeLabel}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: m.fg }}>{m.label}</span>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: UI.ink, lineHeight: 1.6 }}>{r.question}</div>

      {(x.aiSaid || x.fact) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <div style={box(failed ? "#FFF7F5" : "#FBFAFD", failed ? "#F3D5CE" : UI.hairline)}>
            <div style={{ ...cap, color: failed ? m.fg : UI.ink3 }}>AI가 한 말</div>
            <div style={{ fontSize: 13.5, color: UI.ink, lineHeight: 1.6 }}>{x.aiSaid || "—"}</div>
            {x.quote && x.quote !== x.aiSaid && (
              <div style={{ fontSize: 12.5, color: UI.ink2, marginTop: 6, lineHeight: 1.55 }}>답변 원문: “{x.quote}”</div>
            )}
          </div>
          <div style={box("#F4FAF7", "#CFE9DC")}>
            <div style={{ ...cap, color: "#1F7A52" }}>공식 확인 결과</div>
            <div style={{ fontSize: 13.5, color: UI.ink, lineHeight: 1.6 }}>{x.fact || "—"}</div>
            {x.citations?.length > 0 && (
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {x.citations.map((c, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: c.exists ? "#1F7A52" : "#C6402F" }}>
                    {c.exists ? "✓ 실재" : "✕ 존재하지 않음"} · <span style={{ color: UI.ink }}>{c.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {x.original && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12.5, color: UI.accent, cursor: "pointer", fontWeight: 600 }}>조문 원문 보기</summary>
                <div style={{ fontSize: 12.5, color: UI.ink2, lineHeight: 1.7, marginTop: 6, whiteSpace: "pre-wrap" }}>{x.original}</div>
              </details>
            )}
          </div>
        </div>
      )}

      {x.why && (
        <div style={{ marginTop: 12, fontSize: 13.5, color: UI.ink, lineHeight: 1.65 }}>
          <b style={{ color: m.fg }}>{failed ? "어디가 틀렸나 " : "판정 근거 "}</b>{x.why}
        </div>
      )}
      {failed && x.risk && (
        <div style={{ marginTop: 6, fontSize: 13, color: UI.ink2, lineHeight: 1.65 }}>
          <b style={{ color: UI.ink }}>왜 문제인가 </b>{x.risk}
        </div>
      )}
      {failed && x.correct && (
        <div style={{ marginTop: 6, fontSize: 13, color: UI.ink2, lineHeight: 1.65 }}>
          <b style={{ color: UI.ink }}>올바른 답이었다면 </b>{x.correct}
        </div>
      )}
      {sourceHref && (
        <a href={sourceHref} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 600, color: UI.accent, textDecoration: "none" }}>
          직접 확인하기 → {x.source.label}
        </a>
      )}
    </div>
  );
}
