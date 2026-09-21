// 문맥 복구 — 검증 카드 바로 아래에 붙는 두 번째 서비스.
//
// AI가 없는 사실을 말하는 경로는 크게 둘이다. 애초에 모르는 것을 아는 척하거나,
// 알던 것을 잊고 지어내거나. 위쪽 검증 카드가 앞의 것을 잡고, 이 카드가 뒤의 것을
// 잡는다 — 대화가 길어지면 앞서 정한 결정과 제약이 문맥 창 밖으로 밀려나고,
// 그 빈자리를 모델이 그럴듯한 추측으로 메운다.
//
// 결과는 판정이 아니라 **붙여넣을 글**이다. 그래서 이 화면의 목적지는 하나,
// 복사 버튼이다. 나머지(정해진 것·제약·어긋난 지점)는 그 글을 믿어도 되는지
// 확인하라고 같이 보여 주는 근거다.
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiJson } from "@/components/yume/api";

const UI = {
  ink: "#141118",
  ink2: "#54505E",
  ink3: "#8B8694",
  accent: "#5B3FA0",
  hairline: "rgba(20, 17, 24, 0.10)",
  hairlineStrong: "rgba(20, 17, 24, 0.16)",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F2ED",
  shadowCard: "0 1px 2px rgba(20,17,24,0.05), 0 10px 30px rgba(20,17,24,0.06)",
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Roboto Mono", monospace',
};
const EASE = [0.22, 1, 0.36, 1];

const MIN_CHARS = 200;
const MAX_CHARS = 60000;

const PLACEHOLDER = `AI와 나눈 대화를 그대로 붙여넣으세요.

예시:
나: 이번 프로젝트는 React로 갑니다. 예산은 500만원이고요.
AI: 네, React로 진행하겠습니다…
(중략)
AI: Vue로 만드셨으니 이 부분은…   ← 이렇게 앞 내용과 어긋나기 시작한 대화`;

function Block({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: tone || UI.ink3, letterSpacing: "-0.01em", marginBottom: 8 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li key={i} style={{ position: "relative", paddingLeft: 15, fontSize: 13.5, lineHeight: 1.7, color: UI.ink2 }}>
            <span aria-hidden style={{ position: "absolute", left: 0, top: 10, width: 6, height: 1, background: UI.hairlineStrong }} />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ContextRepairCard({ onNeedIdentity }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  // 링크가 기본이다. 붙여넣기는 링크가 막혔을 때의 길이라 접어 둔다.
  const [manual, setManual] = useState(false);
  const [state, setState] = useState("idle"); // idle · loading · done
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState("");
  const [sources, setSources] = useState([]);

  // 어떤 서비스를 읽을 수 있는지는 서버가 정한다. 화면에 목록을 또 적어 두면
  // 서버가 하나 늘렸을 때 안내만 옛날 것으로 남는다.
  useEffect(() => {
    if (!open || sources.length) return;
    apiJson("/api/context-repair/sources")
      .then((d) => setSources(d.sources || []))
      .catch(() => {});
  }, [open, sources.length]);

  const chars = text.trim().length;
  const linkOk = /^https:\/\/\S+$/i.test(url.trim());
  const ready = manual ? chars >= MIN_CHARS && chars <= MAX_CHARS : linkOk;

  // 링크를 주소창에서 복사해 온 사람이 대부분이라, 버튼 한 번으로 넣게 한다.
  async function pasteLink() {
    setPasteHint("");
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) return setPasteHint("클립보드가 비어 있어요.");
      setUrl(t);
      setManual(false);
    } catch {
      setPasteHint("브라우저가 붙여넣기를 막고 있어요. 입력칸에서 Ctrl+V(Mac은 ⌘V)를 눌러주세요.");
    }
  }

  async function run() {
    setError("");
    setPasteHint("");
    setState("loading");
    try {
      const body = manual ? { transcript: text.trim() } : { url: url.trim() };
      const data = await apiJson("/api/context-repair", { method: "POST", body });
      setResult(data);
      setState("done");
    } catch (e) {
      // 본인확인만 남은 경우다. 오류로 끝내지 않고 인증 창을 띄운 뒤,
      // 마쳤으면 방금 누른 것을 그대로 이어서 실행한다 — 검증 카드와 같은 방식이다.
      if (e.code === "IDENTITY_REQUIRED" && onNeedIdentity) {
        setState("idle");
        if (await onNeedIdentity()) return run();
      }
      // 링크를 못 읽는 경우는 사용자가 고칠 수 없는 것이 많다(비공개, 구조 변경).
      // 막다른 길로 두지 않고 붙여넣기 칸을 열어 준다.
      if (!manual && e.code && e.code !== "IDENTITY_REQUIRED") setManual(true);
      setError(e.message || "문맥을 정리하지 못했어요. 잠시 후 다시 시도해주세요.");
      setState("idle");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("브라우저가 복사를 막고 있어요. 아래 글을 직접 선택해 복사해주세요.");
    }
  }

  function reset() {
    setResult(null);
    setState("idle");
    setError("");
    setText("");
    setUrl("");
    setManual(false);
    setPasteHint("");
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{
        marginTop: 18, borderRadius: 20, background: UI.surface,
        border: `1px solid ${UI.hairline}`, boxShadow: UI.shadowCard, overflow: "hidden",
      }}
    >
      {/* 머리 — 닫혀 있을 때는 이 줄만 보인다. 검증 카드가 주인공이고
          이건 두 번째 서비스라, 열려 있는 채로 자리를 차지하지 않는다. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 11, textAlign: "left",
          padding: "18px clamp(16px, 3vw, 28px)", border: "none", background: "transparent", cursor: "pointer",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: UI.ink, letterSpacing: "-0.02em" }}>
              대화가 꼬였나요? 문맥 되살리기
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 999,
              color: "#fff", background: "linear-gradient(135deg, #8A6BD4 0%, #5B3FA0 100%)", fontFamily: UI.mono,
            }}>NEW SERVICE</span>
          </div>
          <div style={{ fontSize: 13.5, color: UI.ink2, marginTop: 5, lineHeight: 1.6 }}>
            대화가 길어지면 AI는 앞서 정한 것을 잊고 지어내기 시작합니다.
            주고받은 내용을 붙여넣으면, 다시 붙여넣을 <b style={{ fontWeight: 600, color: UI.ink }}>문맥 요약 프롬프트</b>를 만들어 드려요.
          </div>
        </div>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          style={{ flex: "none", fontSize: 13, color: UI.ink3 }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.36, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 clamp(16px, 3vw, 28px) clamp(20px, 3vw, 26px)" }}>
              {state !== "done" && (
                <>
                  {/* 링크가 기본 입력이다. 대화를 통째로 복사해 붙여넣는 것보다
                      공유 링크 하나를 가져오는 편이 훨씬 짧은 동작이다. */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setManual(false); }}
                      placeholder="https://chatgpt.com/share/…"
                      inputMode="url"
                      style={{
                        flex: "1 1 240px", minWidth: 0, boxSizing: "border-box", height: 48,
                        padding: "0 14px", borderRadius: 13, border: `1px solid ${UI.hairline}`,
                        background: "#FBFAF8", color: UI.ink, fontSize: 14.5, fontFamily: "inherit", outline: "none",
                      }}
                    />
                    <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={pasteLink} style={{
                      flex: "none", height: 48, padding: "0 16px", borderRadius: 13,
                      border: `1px solid ${UI.hairlineStrong}`, background: UI.surface, color: UI.ink,
                      fontSize: 14.5, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                    }}>붙여넣기</motion.button>
                  </div>

                  {/* 링크를 어디서 복사하는지. 서비스마다 위치가 달라서 한 줄씩 적어 둔다. */}
                  {sources.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: UI.ink3, lineHeight: 1.75 }}>
                      {sources.map((s2) => (
                        <div key={s2.label}>
                          <b style={{ fontWeight: 600, color: UI.ink2 }}>{s2.label}</b> · {s2.how}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 붙여넣기 칸은 접어 둔다 — 링크가 막혔을 때만 필요하다. */}
                  {!manual ? (
                    <button type="button" onClick={() => setManual(true)} style={{
                      marginTop: 10, border: "none", background: "transparent", padding: 0,
                      fontSize: 13, color: UI.accent, fontWeight: 600, cursor: "pointer",
                    }}>
                      링크 대신 대화를 직접 붙여넣기
                    </button>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12.5, color: UI.ink3, marginBottom: 7 }}>
                        대화를 그대로 붙여넣으세요. 링크를 넣으면 이 칸은 비워 두셔도 됩니다.
                      </div>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={PLACEHOLDER}
                        rows={7}
                        style={{
                          width: "100%", boxSizing: "border-box", padding: "14px 15px", borderRadius: 14,
                          border: `1px solid ${UI.hairline}`, background: "#FBFAF8", color: UI.ink,
                          fontSize: 14.5, lineHeight: 1.7, fontFamily: "inherit", resize: "vertical", outline: "none",
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.985 }}
                      onClick={run}
                      disabled={!ready || state === "loading"}
                      style={{
                        height: 46, padding: "0 20px", borderRadius: 13, border: "none",
                        background: ready && state !== "loading" ? UI.accent : "rgba(118,118,128,0.14)",
                        color: ready && state !== "loading" ? "#fff" : UI.ink3,
                        fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em",
                        cursor: ready && state !== "loading" ? "pointer" : "default",
                      }}
                    >
                      {state === "loading" ? (manual ? "정리하는 중…" : "대화를 읽는 중…") : "문맥 프롬프트 만들기"}
                    </motion.button>
                    <span style={{ fontSize: 12.5, color: UI.ink3, fontVariantNumeric: "tabular-nums" }}>
                      {manual
                        ? (chars < MIN_CHARS ? `${(MIN_CHARS - chars).toLocaleString()}자 더 필요해요` : `${chars.toLocaleString()}자`)
                        : "공유 링크를 넣어주세요"}
                    </span>
                  </div>
                  {pasteHint && (
                    <p style={{ fontSize: 12.5, color: UI.ink3, lineHeight: 1.6, margin: "10px 0 0" }}>{pasteHint}</p>
                  )}
                </>
              )}

              {state === "done" && result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
                  {result.source && (
                    <div style={{ fontSize: 12.5, color: UI.ink3, marginBottom: 10 }}>
                      {result.source.service} 공유 링크에서 읽었어요.
                    </div>
                  )}
                  {result.goal && (
                    <div style={{ fontSize: 13.5, color: UI.ink2, lineHeight: 1.7, marginBottom: 14 }}>
                      <b style={{ color: UI.ink, fontWeight: 600 }}>이 대화의 목적</b> · {result.goal}
                    </div>
                  )}

                  {/* 결과의 목적지는 이 상자다. 나머지는 이 글을 믿어도 되는지 보라고 붙은 근거다. */}
                  <div style={{
                    position: "relative", borderRadius: 16, border: `1px solid ${UI.hairlineStrong}`,
                    background: UI.surfaceAlt, padding: "16px 16px 14px",
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: UI.ink3,
                      fontFamily: UI.mono, marginBottom: 10,
                    }}>
                      붙여넣을 프롬프트
                    </div>
                    <div style={{
                      fontSize: 14, lineHeight: 1.8, color: UI.ink, whiteSpace: "pre-wrap",
                      maxHeight: 340, overflow: "auto",
                    }}>
                      {result.prompt}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={copy} style={{
                      flex: "1 1 180px", height: 48, borderRadius: 13, border: "none",
                      background: copied ? "#0F6B45" : UI.accent, color: "#fff",
                      fontSize: 15, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                    }}>
                      {copied ? "복사했어요" : "프롬프트 복사"}
                    </motion.button>
                    <motion.button type="button" whileTap={{ scale: 0.985 }} onClick={reset} style={{
                      flex: "1 1 140px", height: 48, borderRadius: 13,
                      border: `1px solid ${UI.hairlineStrong}`, background: UI.surface, color: UI.ink,
                      fontSize: 15, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.01em",
                    }}>
                      다른 대화 정리
                    </motion.button>
                  </div>

                  <Block title="정해진 것" items={result.decided} />
                  <Block title="지켜야 하는 것" items={result.constraints} />
                  <Block title="아직 안 정해진 것" items={result.open} />

                  {result.drift?.length > 0 && (
                    <div style={{ marginTop: 18, borderTop: `1px solid ${UI.hairline}`, paddingTop: 16 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#A32B1A", marginBottom: 9 }}>
                        앞 내용과 어긋난 지점 {result.drift.length}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {result.drift.map((d, i) => (
                          <div key={i} style={{
                            padding: "11px 13px", borderRadius: 12, background: "#FBEBE7", border: "1px solid rgba(163,43,26,0.14)",
                          }}>
                            <div style={{ fontSize: 13.5, color: UI.ink, lineHeight: 1.65 }}>{d.what}</div>
                            {d.correct && (
                              <div style={{ fontSize: 13, color: "#A32B1A", marginTop: 5, lineHeight: 1.6 }}>
                                실제로 정해졌던 것 · {d.correct}
                              </div>
                            )}
                            {d.where && (
                              <div style={{ fontSize: 12, color: UI.ink3, marginTop: 4, fontFamily: UI.mono }}>{d.where}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.note && (
                    <p style={{ fontSize: 12.5, color: UI.ink3, lineHeight: 1.7, margin: "16px 0 0" }}>{result.note}</p>
                  )}
                </motion.div>
              )}

              {error && (
                <p style={{ fontSize: 13, color: "#A32B1A", lineHeight: 1.6, margin: "12px 0 0" }}>{error}</p>
              )}

              <p style={{ fontSize: 12, color: UI.ink3, lineHeight: 1.7, margin: "14px 0 0" }}>
                링크는 공개된 공유 페이지만 읽습니다. 대화에 실제로 나온 내용만 옮기고,
                빠진 부분을 채워 넣지 않으며, 이름·연락처 같은 식별정보는 프롬프트에 담지 않습니다.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
