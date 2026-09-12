import { useState } from "react";
import { motion } from "framer-motion";
import { apiJson } from "./api";

const input = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #D4BEF0",
  margin: "6px 0 12px", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit",
};
const label = { fontSize: 12.5, color: "#6E6389", fontWeight: 500 };

function Check({ checked, onChange, children, strong }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#4C5266", lineHeight: 1.55, marginBottom: 7, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: "#6B4FA8" }} />
      <span style={{ fontWeight: strong ? 700 : 400 }}>{children}</span>
    </label>
  );
}

export default function AuthModal({ mode: initialMode = "login", onClose, onAuthed }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [showDataDetail, setShowDataDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const allChecked = terms && privacy && dataConsent;
  const setAll = (v) => { setTerms(v); setPrivacy(v); setDataConsent(v); };

  const submit = async (e) => {
    e?.preventDefault();
    setError(""); setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const r = await apiJson("/api/auth/forgot", { method: "POST", body: { email } });
        setNotice(r.message);
      } else if (mode === "signup") {
        if (!terms || !privacy) throw new Error("필수 항목에 동의해주세요.");
        const r = await apiJson("/api/auth/signup", { method: "POST", body: { email, password, name, agreeTerms: terms, agreePrivacy: privacy, dataConsent } });
        onAuthed(r.user);
      } else {
        const r = await apiJson("/api/auth/login", { method: "POST", body: { email, password } });
        onAuthed(r.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "로그인" : mode === "signup" ? "유메 시작하기" : "비밀번호 재설정";
  const sub = mode === "login"
    ? "검증 기록이 계정에 저장되고, 어느 기기에서든 이어볼 수 있어요."
    : mode === "signup"
      ? "가입하면 검증 기록 저장과 API 키 발급을 쓸 수 있어요."
      : "가입한 이메일로 재설정 링크를 보내드려요.";

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(75,55,120,0.28)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 60, backdropFilter: "blur(2px)", padding: 16, overflowY: "auto",
    }}>
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}
        style={{ width: "min(400px, 100%)", background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(75,55,120,0.22)", position: "relative" }}
      >
        <button type="button" onClick={onClose} aria-label="닫기" style={{ position: "absolute", top: 14, right: 16, border: "none", background: "transparent", color: "#9C8FC2", fontSize: 18, cursor: "pointer" }}>×</button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "#A99BC9", marginBottom: 20, lineHeight: 1.6 }}>{sub}</div>

        <label style={label} htmlFor="auth-email">이메일</label>
        <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={input} />

        {mode !== "forgot" && (
          <>
            <label style={label} htmlFor="auth-pw">비밀번호</label>
            <input id="auth-pw" type="password" required autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "영문+숫자 8자 이상" : "••••••••"} style={input} />
          </>
        )}

        {mode === "signup" && (
          <>
            <label style={label} htmlFor="auth-name">이름 <span style={{ color: "#B6A9D6" }}>(선택)</span></label>
            <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} style={input} />
            <div style={{ border: "1px solid #EDE3FA", borderRadius: 12, padding: "12px 12px 5px", marginBottom: 14 }}>
              <Check checked={allChecked} onChange={setAll} strong>전체 동의</Check>
              <div style={{ height: 1, background: "#F1EAFB", margin: "4px 0 9px" }} />
              <Check checked={terms} onChange={setTerms}>
                [필수] 만 14세 이상이며 <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "#6B4FA8" }}>이용약관</a>에 동의합니다
              </Check>
              <Check checked={privacy} onChange={setPrivacy}>
                [필수] <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "#6B4FA8" }}>개인정보 수집·이용</a>에 동의합니다 (검증 처리를 위한 국외 위탁 포함)
              </Check>
              <Check checked={dataConsent} onChange={setDataConsent}>
                [선택] 가명처리한 검증 데이터의 제3자 제공에 동의합니다{" "}
                <span onClick={(e) => { e.preventDefault(); setShowDataDetail((v) => !v); }} style={{ color: "#6B4FA8", textDecoration: "underline", cursor: "pointer" }}>
                  {showDataDetail ? "접기" : "자세히"}
                </span>
              </Check>
              {showDataDetail && (
                <div style={{ fontSize: 11.5, color: "#6E6389", background: "#FAF7FF", borderRadius: 8, padding: "9px 10px", marginBottom: 9, lineHeight: 1.65 }}>
                  <b>제공받는 자</b> 유메와 데이터 이용 계약을 맺은 AI 개발 기업·연구기관<br />
                  <b>목적</b> AI 답변의 사실 오류(할루시네이션) 연구와 정확도 개선<br />
                  <b>항목</b> 유메가 추출한 주장 문장·판정·근거(원문·이메일·IP 제외, 이름·연락처 등은 가림)<br />
                  <b>보유 기간</b> 제공받는 자와의 계약 기간<br />
                  동의하지 않아도 서비스 이용에 제한이 없고, 계정 설정에서 언제든 철회할 수 있어요.
                </div>
              )}
            </div>
          </>
        )}

        {error && <div role="alert" style={{ fontSize: 12.5, color: "#C6402F", background: "#FBE9E7", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
        {notice && <div style={{ fontSize: 12.5, color: "#1F7A52", background: "#EAF7F0", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>{notice}</div>}

        <button type="submit" disabled={busy} style={{
          width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#241F33",
          color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
        }}>
          {busy ? "처리 중…" : mode === "login" ? "로그인" : mode === "signup" ? "계정 만들기" : "재설정 링크 보내기"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "#9C8FC2", lineHeight: 1.9 }}>
          {mode === "login" && (
            <>
              <span onClick={() => { setMode("forgot"); setError(""); }} style={{ cursor: "pointer", textDecoration: "underline" }}>비밀번호를 잊으셨나요?</span><br />
              계정이 없으신가요? <span onClick={() => { setMode("signup"); setError(""); }} style={{ color: "#0A0A0A", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>가입하기</span>
            </>
          )}
          {mode !== "login" && (
            <>이미 계정이 있으신가요? <span onClick={() => { setMode("login"); setError(""); setNotice(""); }} style={{ color: "#0A0A0A", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>로그인</span></>
          )}
        </div>
      </motion.form>
    </div>
  );
}
