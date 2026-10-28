// 무료 진단 신청 — 메인 마지막 구역에 바로 놓인 양식(창을 띄우지 않는다: 결정한 사람이 한 번 더 누를 일을 없앤다).
// 도입 문의와 같은 /api/inquiry 로 보내 운영자 데스크의 대화로 들어가고(kind: veriline_diagnosis), 담당자 메일로 대화 링크가 간다.
import { useState } from "react";
import { API_ORIGIN, FORM_PRIVACY_NOTE, PRIVACY_URL } from "../../businessConfig.js";

const FIELDS = ["노무", "법률", "세무", "의료", "기타"];

export default function DiagnosisForm() {
  const [f, setF] = useState({ name: "", company: "", contact: "", url: "", field: "노무", worry: "", website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [threadUrl, setThreadUrl] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setState("sending");
    const message = [
      "[베리라인 무료 진단 신청]",
      `AI 서비스 주소: ${f.url}`,
      `분야: ${f.field}`,
      f.worry.trim() ? `특히 걱정되는 부분: ${f.worry.trim()}` : null,
    ].filter(Boolean).join("\n");
    try {
      const r = await fetch(`${API_ORIGIN}/api/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, contact: f.contact, company: f.company, kind: "veriline_diagnosis", budget: "undecided", message, website: f.website }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setThreadUrl(data.threadUrl || "");
      setState("done");
    } catch (err) {
      setError(err.message || "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="vl-form">
        <div className="done">
          <b>신청을 받았습니다</b>
          <p>보통 영업일 3일 안에 찾은 오류와 근거 조문을 보내 드립니다. 진행 상황과 답장은 아래 대화 화면에서 이어집니다.</p>
          {threadUrl && <a className="vl-btn key" href={threadUrl} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>대화 열기 →</a>}
          <p className="fine">{/.+@.+\..+/.test(f.contact) ? `같은 링크를 ${f.contact}로도 보내 드렸습니다.` : "위 버튼을 눌러 대화 화면을 즐겨찾기해 두세요."}</p>
        </div>
      </div>
    );
  }

  return (
    <form className="vl-form" onSubmit={submit} aria-label="무료 진단 신청">
      <div className="two">
        <label htmlFor="dg-name">담당자 성함 *<input id="dg-name" required maxLength={60} autoComplete="name" value={f.name} onChange={set("name")} /></label>
        <label htmlFor="dg-company">회사명<input id="dg-company" maxLength={100} autoComplete="organization" value={f.company} onChange={set("company")} /></label>
      </div>
      <label htmlFor="dg-contact">이메일 *<input id="dg-contact" type="email" required maxLength={200} autoComplete="email" placeholder="결과를 받을 주소" value={f.contact} onChange={set("contact")} /></label>
      <div className="two">
        <label htmlFor="dg-url">AI 서비스 주소 *<input id="dg-url" required maxLength={200} placeholder="예: example.com" value={f.url} onChange={set("url")} /></label>
        <label htmlFor="dg-field">분야<select id="dg-field" value={f.field} onChange={set("field")}>{FIELDS.map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <label htmlFor="dg-worry">특히 걱정되는 부분 (선택)<textarea id="dg-worry" rows={3} maxLength={1500} placeholder="예: 최근 개정된 육아휴직 제도를 맞게 안내하는지" value={f.worry} onChange={set("worry")} style={{ resize: "vertical" }} /></label>
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
      {error && <div className="err" role="alert">{error}</div>}
      <button type="submit" className="vl-btn key" disabled={state === "sending"}>{state === "sending" ? "보내는 중…" : "무료 진단 신청 →"}</button>
      <p className="fine">보내 주신 정보는 진단 결과 안내에만 씁니다. 결과는 귀사에만 비공개로 드립니다.<br />{FORM_PRIVACY_NOTE} <a href={PRIVACY_URL} target="_blank" rel="noreferrer">개인정보처리방침</a></p>
    </form>
  );
}
