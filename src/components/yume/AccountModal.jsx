import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiJson } from "./api";

const TABS = [
  ["profile", "프로필"],
  ["api", "API 키"],
  ["data", "데이터"],
  ["security", "보안"],
];

const field = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #D4BEF0",
  margin: "5px 0 12px", fontSize: 13.5, boxSizing: "border-box", fontFamily: "inherit",
};
const lbl = { fontSize: 12, color: "#6E6389", fontWeight: 600 };
const primaryBtn = (disabled) => ({
  padding: "9px 16px", borderRadius: 10, border: "none", background: "linear-gradient(90deg,#B49AEE,#6B4FA8)",
  color: "#fff", fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
});
const ghostBtn = { padding: "8px 14px", borderRadius: 999, border: "1px solid #D4BEF0", background: "#fff", color: "#6B4FA8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const fmt = (ts) => (ts ? new Date(ts).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" }) : "-");

function Status({ msg }) {
  if (!msg) return null;
  const ok = msg.type === "ok";
  return <div style={{ fontSize: 12.5, color: ok ? "#1F7A52" : "#C6402F", background: ok ? "#EAF7F0" : "#FBE9E7", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>{msg.text}</div>;
}

function ProfileTab({ user, usage, onUserChange }) {
  const [name, setName] = useState(user.name || "");
  const [company, setCompany] = useState(user.company || "");
  const [msg, setMsg] = useState(null);
  const save = async () => {
    try {
      const r = await apiJson("/api/account", { method: "PATCH", body: { name, company } });
      onUserChange(r.user);
      setMsg({ type: "ok", text: "저장했어요." });
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  };
  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 150, background: "#F7F1FE", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11.5, color: "#8577A8", fontWeight: 600 }}>요금제</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#3B3159" }}>{user.planLabel}</div>
          {user.planExpiresAt && <div style={{ fontSize: 11.5, color: "#A99BC9" }}>{fmt(user.planExpiresAt)}까지</div>}
        </div>
        {usage && (
          <div style={{ flex: 1, minWidth: 150, background: "#F7F1FE", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11.5, color: "#8577A8", fontWeight: 600 }}>오늘 남은 확인</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#3B3159" }}>{usage.remainingFree} / {usage.dailyLimit}회</div>
            {usage.tokens > 0 && <div style={{ fontSize: 11.5, color: "#A99BC9" }}>추가 토큰 {usage.tokens}개</div>}
          </div>
        )}
      </div>
      <Status msg={msg} />
      <label style={lbl}>이메일</label>
      <input value={user.email} disabled style={{ ...field, background: "#F7F5FA", color: "#8577A8" }} />
      <label style={lbl}>이름</label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} style={field} />
      <label style={lbl}>회사 <span style={{ color: "#B6A9D6", fontWeight: 400 }}>(API·비즈니스 이용 시)</span></label>
      <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} style={field} />
      <button onClick={save} style={primaryBtn(false)}>저장</button>
    </>
  );
}

function ApiTab() {
  const [keys, setKeys] = useState(null);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState(null);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const load = () => apiJson("/api/account/api-keys").then((r) => setKeys(r.keys)).catch((e) => setMsg({ type: "err", text: e.message }));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setMsg(null);
    try {
      const r = await apiJson("/api/account/api-keys", { method: "POST", body: { label } });
      setCreated(r.key);
      setLabel("");
      setCopied(false);
      load();
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  };
  const revoke = async (id) => {
    if (!window.confirm("이 키를 폐기할까요? 이 키를 쓰는 서비스의 호출이 바로 실패합니다.")) return;
    try {
      await apiJson(`/api/account/api-keys/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <p style={{ fontSize: 12.5, color: "#8577A8", lineHeight: 1.7, margin: "0 0 14px" }}>
        자사 서비스의 AI 답변을 사용자에게 보여주기 전에 유메로 확인할 수 있어요. 키는 서버에서만 쓰세요.{" "}
        <a href="/docs/api" target="_blank" rel="noreferrer" style={{ color: "#6B4FA8", fontWeight: 600 }}>API 문서 보기 →</a>
      </p>
      <Status msg={msg} />
      {created && (
        <div style={{ background: "#211A32", borderRadius: 12, padding: "14px 16px", marginBottom: 16, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, color: "#E8E1FA" }}>
          <div style={{ color: "#F3C98B", marginBottom: 6, fontFamily: "inherit" }}>이 키는 지금 한 번만 보여드려요. 안전한 곳에 복사해두세요.</div>
          <div style={{ wordBreak: "break-all", marginBottom: 10 }}>{created}</div>
          <button onClick={copy} style={{ ...ghostBtn, background: "transparent", color: "#E8E1FA", borderColor: "#5B4B84" }}>{copied ? "복사됨 ✓" : "키 복사"}</button>
          <div style={{ color: "#B7A9DD", margin: "12px 0 4px" }}>curl 예시</div>
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6 }}>
{`curl -X POST ${origin}/v1/verify \\
  -H "Authorization: Bearer ${created}" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"확인할 AI 답변","wait":true}'`}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="키 이름 (예: 운영 서버)" maxLength={60} style={{ ...field, margin: 0, flex: 1 }} />
        <button onClick={create} style={primaryBtn(false)}>새 키 발급</button>
      </div>
      {keys === null ? (
        <div style={{ fontSize: 12.5, color: "#B6A9D6" }}>불러오는 중…</div>
      ) : keys.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#B6A9D6" }}>아직 발급한 키가 없어요.</div>
      ) : (
        keys.map((k) => (
          <div key={k.id} style={{ border: "1px solid #EDE3FA", borderRadius: 12, padding: "11px 13px", marginBottom: 8, opacity: k.status === "active" ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#241F33" }}>{k.label} {k.status !== "active" && <span style={{ fontSize: 11, color: "#C6402F" }}>폐기됨</span>}</div>
                <div style={{ fontSize: 11.5, color: "#8577A8", fontFamily: "ui-monospace, monospace" }}>{k.maskedKey}</div>
              </div>
              {k.status === "active" && <button onClick={() => revoke(k.id)} style={{ ...ghostBtn, color: "#C6402F", borderColor: "#F0BCB0" }}>폐기</button>}
            </div>
            <div style={{ fontSize: 11.5, color: "#A99BC9", marginTop: 6 }}>
              이번 달 {k.usedThisMonth.toLocaleString()} / {k.monthlyQuota.toLocaleString()}회 · 분당 {k.ratePerMin}회 · 발급 {fmt(k.createdAt)} · 최근 사용 {fmt(k.lastUsedAt)}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function DataTab({ user, onUserChange }) {
  const [msg, setMsg] = useState(null);
  const toggle = async () => {
    try {
      const r = await apiJson("/api/account", { method: "PATCH", body: { dataConsent: !user.dataConsent } });
      onUserChange(r.user);
      setMsg({ type: "ok", text: r.user.dataConsent ? "데이터 제공에 동의했어요. 이후 검증부터 적용돼요." : "동의를 철회했어요. 이전 기록도 앞으로 제공되지 않아요." });
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  };
  return (
    <>
      <Status msg={msg} />
      <div style={{ border: "1px solid #EDE3FA", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#241F33" }}>가명처리한 검증 데이터 제공 [선택]</div>
            <div style={{ fontSize: 12, color: "#8577A8", lineHeight: 1.65, marginTop: 4 }}>
              동의하면 유메가 추출한 주장·판정·근거가 이름·연락처 등을 가린 형태로 AI 연구·개선을 위한 데이터셋에 포함될 수 있어요. 입력 원문과 이메일·IP는 절대 포함되지 않아요.
            </div>
          </div>
          <button onClick={toggle} role="switch" aria-checked={user.dataConsent} style={{
            flexShrink: 0, width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
            background: user.dataConsent ? "#6B4FA8" : "#DCD3EA", transition: "background 0.2s",
          }}>
            <span style={{ position: "absolute", top: 3, left: user.dataConsent ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>
      </div>
      <div style={{ border: "1px solid #EDE3FA", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#241F33" }}>내 데이터 내려받기</div>
        <div style={{ fontSize: 12, color: "#8577A8", lineHeight: 1.65, margin: "4px 0 10px" }}>계정 정보·동의 내역·검증 기록·대화·API 키 목록을 JSON 파일로 받아요.</div>
        <a href="/api/account/export" style={{ ...ghostBtn, display: "inline-block", textDecoration: "none" }}>JSON으로 내려받기</a>
      </div>
      <p style={{ fontSize: 11.5, color: "#A99BC9", marginTop: 12 }}>
        자세한 내용은 <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: "#8577A8" }}>개인정보처리방침</a>을 확인하세요.
      </p>
    </>
  );
}

function SecurityTab({ onLoggedOut }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState(null);
  const [delPw, setDelPw] = useState("");
  const [delMsg, setDelMsg] = useState(null);

  const change = async () => {
    try {
      await apiJson("/api/account/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setCurrent(""); setNext("");
      setMsg({ type: "ok", text: "비밀번호를 바꿨어요. 다른 기기의 로그인은 모두 해제됐어요." });
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    }
  };
  const withdraw = async () => {
    if (!window.confirm("탈퇴하면 검증 기록·API 키를 포함한 모든 정보가 바로 삭제되고 되돌릴 수 없어요. 탈퇴할까요?")) return;
    try {
      await apiJson("/api/account", { method: "DELETE", body: { password: delPw } });
      onLoggedOut("탈퇴가 완료됐어요. 그동안 유메를 이용해주셔서 감사합니다.");
    } catch (e) {
      setDelMsg({ type: "err", text: e.message });
    }
  };
  return (
    <>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#241F33", marginBottom: 8 }}>비밀번호 변경</div>
      <Status msg={msg} />
      <label style={lbl}>현재 비밀번호</label>
      <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={field} />
      <label style={lbl}>새 비밀번호</label>
      <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="영문+숫자 8자 이상" style={field} />
      <button onClick={change} style={primaryBtn(false)}>변경</button>

      <div style={{ borderTop: "1px solid #F1EAFB", margin: "24px 0 16px" }} />
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#C6402F", marginBottom: 6 }}>회원 탈퇴</div>
      <div style={{ fontSize: 12, color: "#8577A8", lineHeight: 1.65, marginBottom: 10 }}>계정과 검증 기록, API 키, 대화 기록이 지체 없이 파기돼요.</div>
      <Status msg={delMsg} />
      <div style={{ display: "flex", gap: 8 }}>
        <input type="password" placeholder="비밀번호 확인" value={delPw} onChange={(e) => setDelPw(e.target.value)} style={{ ...field, margin: 0, flex: 1 }} />
        <button onClick={withdraw} disabled={!delPw} style={{ ...ghostBtn, color: "#C6402F", borderColor: "#F0BCB0", opacity: delPw ? 1 : 0.5 }}>탈퇴하기</button>
      </div>
    </>
  );
}

export default function AccountModal({ user, usage, initialTab = "profile", onClose, onUserChange, onLoggedOut }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(75,55,120,0.28)", display: "flex",
      alignItems: "flex-start", justifyContent: "center", zIndex: 60, backdropFilter: "blur(2px)", padding: "6vh 16px", overflowY: "auto",
    }}>
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        style={{ width: "min(560px, 100%)", background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(75,55,120,0.22)", position: "relative" }}
      >
        <button onClick={onClose} aria-label="닫기" style={{ position: "absolute", top: 14, right: 16, border: "none", background: "transparent", color: "#9C8FC2", fontSize: 18, cursor: "pointer" }}>×</button>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 2 }}>계정 설정</div>
        <div style={{ fontSize: 12.5, color: "#A99BC9", marginBottom: 16 }}>{user.email}</div>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #EDE3FA", marginBottom: 18, overflowX: "auto", overflowY: "hidden" }}>
          {TABS.map(([id, name]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              border: "none", background: "transparent", padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              color: tab === id ? "#241F33" : "#B6A9D6", borderBottom: tab === id ? "2px solid #241F33" : "2px solid transparent", marginBottom: -1, whiteSpace: "nowrap",
            }}>{name}</button>
          ))}
        </div>
        {tab === "profile" && <ProfileTab user={user} usage={usage} onUserChange={onUserChange} />}
        {tab === "api" && <ApiTab />}
        {tab === "data" && <DataTab user={user} onUserChange={onUserChange} />}
        {tab === "security" && <SecurityTab onLoggedOut={onLoggedOut} />}
      </motion.div>
    </div>
  );
}
