import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { safeUrl } from "./api";
import { t } from "../../i18n.js";

// 특허 도 6 — 판정 결과 화면. 인용된 판례·법령·문헌을 찾지 못했을 때 부존재 신뢰도와
// 그 근거(탐색 커버리지·형식오류·유사 항목), 아직 확인하지 못한 영역을 함께 보여준다.
function Meter({ label, value, hint, invert = false }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#6E6389", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{(value || 0).toFixed(2)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "#EFE6FA", overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: "100%", background: invert ? "linear-gradient(90deg,#F3C98B,#D9822B)" : "#5B3FA0" }}
        />
      </div>
      {hint && <div style={{ fontSize: 11, color: "#A99BC9", marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

export default function NecPanel({ nec }) {
  const [open, setOpen] = useState(false);
  if (!nec) return null;
  const sure = nec.grade === "nonexistent";
  const searched = (nec.coverage?.searched || []).filter((s) => s.ok);
  const failing = (nec.formatError?.checks || []).filter((c) => c.score > 0);
  const similar = nec.proximity?.similar || [];

  return (
    <div style={{ marginTop: 10, borderRadius: 10, border: `1px solid ${sure ? "#EEC3B9" : "rgba(20,17,24,0.12)"}`, background: sure ? "#FFFBFA" : "#FCFBFE" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
          border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          flexShrink: 0, fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums",
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace', letterSpacing: "-0.02em",
          color: sure ? "#A32B1A" : "#5B3FA0",
        }}>{Number(nec.score).toFixed(2)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#141118" }}>
            부존재 신뢰도 · {nec.gradeLabel}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: "#8B8694", lineHeight: 1.5 }}>
            <span style={{ whiteSpace: "nowrap", fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace', fontSize: "0.95em", color: "#54505E" }}>{nec.identifier?.value || nec.identifier?.canonical}</span> — {nec.identifier?.searchSpace}
            {/* 좁은 폰에서 식별자가 쪼개지지 않게, 펼치기 안내는 별도 칸이 아니라 설명 끝에 붙인다 */}
            <span style={{ color: "#9C8FC2", whiteSpace: "nowrap", marginLeft: 8 }}>{open ? "접기 ▴" : "근거 보기 ▾"}</span>
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "2px 14px 14px", fontSize: 12.5, color: "#4C5266", lineHeight: 1.65 }}>
              <p style={{ margin: "0 0 12px" }}>{nec.summary}</p>
              <Meter
                label="탐색 커버리지 C (추정)"
                value={nec.coverage?.value}
                hint={nec.coverage?.logical ? "형식상 존재할 수 없어 검색공간 전체가 배제됐어요" : searched.map((s) => `${s.label} ${Math.round(s.completeness * 100)}%`).join(" + ")}
              />
              <Meter
                label="형식오류 지수 F"
                value={nec.formatError?.value}
                invert
                hint={failing.length ? failing.map((c) => `${c.name}: ${c.note}`).join(" / ") : "체계·범위·시간·발급규칙 모두 이상 없음"}
              />
              <Meter label="유사항목 근접도 P" value={nec.proximity?.value} hint={similar.length ? null : "가까운 실재 항목이 없어요"} />
              {similar.length > 0 && (
                <div style={{ margin: "4px 0 10px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#141118", marginBottom: 4 }}>{t("혹시 이것을 말한 걸까요?")}</div>
                  {similar.map((s, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 3 }}>
                      {safeUrl(s.url) ? (
                        <a href={safeUrl(s.url)} target="_blank" rel="noreferrer" style={{ color: "#6B4FA8", fontWeight: 600 }}>{s.value}</a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{s.value}</span>
                      )}
                      {s.title && <span style={{ color: "#8577A8" }}> {s.title}</span>}
                      <span style={{ color: "#B6A9D6" }}> · 유사도 {Number(s.similarity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: "#8577A8", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", margin: "6px 0 4px" }}>
                NEC = {nec.weights.w1}·C + {nec.weights.w2}·F + {nec.weights.w3}·(1 − P) {sure ? "≥" : "<"} {nec.threshold}
              </div>
              {nec.uncovered?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#141118", marginBottom: 4 }}>{t("아직 확인하지 못한 영역")}</div>
                  {nec.uncovered.map((u, i) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                      <div>{u.area}</div>
                      <div style={{ color: "#6B4FA8" }}>→ {u.howToCheck}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
