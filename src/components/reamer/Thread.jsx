// 의뢰인이 보는 화면 — 문의 하나의 전부.
//
// 여기서 세 가지가 전부 끝나야 한다. 무엇을 이야기했는지 보고(대화), 얼마인지 보고
// (견적), 그 자리에서 내는 것(결제). 하나라도 화면 밖으로 나가면 — 견적을 메일로
// 받고 입금은 계좌로 하는 식이면 — 그 순간 진행 상황이 다시 사람 기억으로 돌아간다.
//
// 로그인은 없다. 링크가 곧 열쇠다.
import { useCallback, useEffect, useRef, useState } from "react";
import { BUSINESS, telHref } from "@/businessInfo";
import { call, forgetToken, readToken } from "./threadApi.js";
import "./thread.css";

const sdk = () => import("@portone/browser-sdk/v2");
const CANCEL_CODES = new Set(["USER_CANCEL", "PAY_PROCESS_CANCELED"]);

const won = (n) => `${Number(n || 0).toLocaleString("ko-KR")}원`;
const clock = (t) =>
  new Date(Number(t) || 0).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_LABEL = {
  sent: "확정 대기",
  accepted: "결제 대기",
  paid: "결제 완료",
  cancelled: "회수됨",
  refunded: "환불됨",
};

export default function Thread() {
  // 토큰은 처음 한 번 읽고 끝이다. 주소가 바뀌면 페이지가 다시 뜬다.
  const [token] = useState(() => readToken());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [gone, setGone] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const talkRef = useRef(null);
  const stick = useRef(true);

  const load = useCallback(
    async (quiet = false) => {
      if (!token) return;
      try {
        const d = await call("/thread", { token });
        setData(d);
        setGone(false);
        if (!quiet) setError("");
      } catch (e) {
        if (e.code === "NO_THREAD") {
          setGone(true);
          forgetToken();
        } else if (!quiet) setError(e.message);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // 답장이 왔는지 확인한다. 이 화면을 안 보고 있을 때까지 두드릴 이유는 없다.
  useEffect(() => {
    if (!token || gone) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) load(true);
    }, 7000);
    const onShow = () => {
      if (!document.hidden) load(true);
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [token, gone, load]);

  // 새 말이 오면 맨 아래로 따라간다. 단, 위쪽을 읽고 있는 중이면 끌어내리지 않는다.
  useEffect(() => {
    const el = talkRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [data]);

  const onScroll = () => {
    const el = talkRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // 모바일 결제창은 페이지를 떠났다가 돌아온다. 돌아온 자리에서 확인을 끝내지 않으면
  // 결제는 됐는데 화면은 그대로인, 가장 불안한 상태로 남는다.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const back = q.get("pay");
    if (!back || !token) return;
    const clean = new URL(window.location.href);
    clean.searchParams.delete("pay");
    window.history.replaceState({}, "", clean.toString());
    call(`/thread/quote/${encodeURIComponent(back)}/confirm`, { method: "POST", token, body: {} })
      .then(() => load())
      .catch((e) => setError(e.message));
  }, [token, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await call("/thread/message", { method: "POST", token, body: { body } });
      setDraft("");
      stick.current = true;
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (!token || gone) return <NoLink expired={gone} />;
  if (!data) {
    return (
      <div className="th">
        <ThreadHead />
        <p className="th__loading">{error || "불러오는 중…"}</p>
      </div>
    );
  }

  const open = data.thread.status !== "closed";
  const pending = data.quotes.filter((q) => q.status === "sent" || q.status === "accepted");

  return (
    <div className="th">
      <ThreadHead title={data.thread.title} name={data.thread.name} />

      {error && <p className="th__error">{error}</p>}

      {data.progress?.show && <ProgressPanel p={data.progress} />}

      {pending.map((q) => (
        <QuoteCard
          key={q.id}
          quote={q}
          payable={data.payable}
          onPay={() => setPayFor(q)}
          onAccept={async (accept) => {
            setError("");
            try {
              await call(`/thread/quote/${q.id}/accept`, { method: "POST", token, body: { accept } });
              await load();
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      ))}

      <section className="th__talk" ref={talkRef} onScroll={onScroll}>
        {data.messages.map((m) => (
          <Bubble key={m.id} m={m} quotes={data.quotes} />
        ))}
      </section>

      {open ? (
        <div className="th__compose">
          <textarea
            id="th-say"
            rows={3}
            value={draft}
            maxLength={5000}
            placeholder={
              data.progress?.done
                ? "인수 후에도 이 자리에서 계속 문의하실 수 있습니다. 수정이나 오류 제보를 적어주세요."
                : "궁금한 점이나 바뀐 요구사항을 적어주세요. 보통 영업일 기준 하루 안에 답장드립니다."
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="th__composeRow">
            <button className="th__send" type="button" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? "보내는 중…" : "보내기"}
            </button>
            <span className="th__hint">Ctrl+Enter로도 보낼 수 있어요</span>
          </div>
        </div>
      ) : (
        <p className="th__closed">종료된 대화입니다. 새로 시작하시려면 사이트에서 다시 문의해주세요.</p>
      )}

      {data.quotes.some((q) => !["sent", "accepted"].includes(q.status)) && (
        <section className="th__history">
          <h2>지난 견적</h2>
          {data.quotes
            .filter((q) => !["sent", "accepted"].includes(q.status))
            .map((q) => (
              <div className="th__past" key={q.id}>
                <span className="th__pastTitle">{q.title}</span>
                <span className={`th__tag th__tag--${q.status}`}>{STATUS_LABEL[q.status] || q.status}</span>
                <span className="th__pastAmount">{won(q.amount)}</span>
              </div>
            ))}
        </section>
      )}

      <ThreadFoot company={data.company} />

      {payFor && <PaySheet quote={payFor} thread={data.thread} token={token} onDone={() => { setPayFor(null); load(); }} onClose={() => setPayFor(null)} />}
    </div>
  );
}

function ThreadHead({ title, name }) {
  return (
    <header className="th__head">
      <a className="th__brand" href="/">
        <span className="th__mark" aria-hidden />
        REAMER
      </a>
      {title && (
        <div className="th__who">
          <p className="th__title">{title}</p>
          {name && <p className="th__sub">{name}님의 의뢰</p>}
        </div>
      )}
    </header>
  );
}

function ThreadFoot({ company }) {
  return (
    <footer className="th__foot">
      <p>
        <b>환불 안내</b> — 작업이 시작되기 전에는 결제하신 금액을 전액 돌려드립니다. 착수 이후에는 이미 진행된
        부분을 제외하고 환불해 드립니다(전자상거래법 제17조).
      </p>
      <p className="th__fine">
        {company?.name || BUSINESS.name} · 대표 {BUSINESS.ceo} · 사업자등록번호 {BUSINESS.regNo}
        <br />
        {BUSINESS.address}
        <br />
        <a href={telHref}>{company?.tel || BUSINESS.tel}</a> ·{" "}
        <a href={`mailto:${company?.email || BUSINESS.email}`}>{company?.email || BUSINESS.email}</a>
      </p>
      <p className="th__fine">이 주소를 아는 사람은 이 대화를 볼 수 있습니다. 공유에 주의해주세요.</p>
    </footer>
  );
}

function Bubble({ m, quotes }) {
  if (m.sender === "system") {
    const q = quotes.find((x) => x.id === m.quoteId);
    return (
      <div className={`th__sys${m.kind === "paid" ? " th__sys--paid" : ""}`}>
        {m.body}
        {q && q.status === "paid" && q.paymentId && <span className="th__receipt">주문번호 {q.paymentId}</span>}
      </div>
    );
  }
  const mine = m.sender === "client";
  return (
    <div className={`th__msg ${mine ? "th__msg--mine" : "th__msg--them"}`}>
      {!mine && <span className="th__from">리머</span>}
      <p>{m.body}</p>
      <time>{clock(m.at)}</time>
    </div>
  );
}

/**
 * 견적 카드. 확정 → 결제 두 단계로 나뉜다.
 *
 * 금액 옆에 결제 버튼을 바로 두지 않는 이유는, 그런 화면이 그 금액에 무엇이
 * 포함되는지를 읽지 않게 만들기 때문이다. 확정을 먼저 누르게 하면 범위를 읽고
 * 결정할 자리가 생기고, 결제는 그다음에 하는 일이 된다.
 */
function QuoteCard({ quote, payable, onPay, onAccept }) {
  const [busy, setBusy] = useState(false);
  const expired = quote.expiresAt && quote.expiresAt < Date.now();
  const accepted = quote.status === "accepted";

  const accept = async (yes) => {
    setBusy(true);
    await onAccept(yes);
    setBusy(false);
  };

  return (
    <section className={`th__quote${accepted ? " th__quote--accepted" : ""}`}>
      <p className="th__quoteLabel">{accepted ? "확정된 견적 · 결제만 남았습니다" : "견적"}</p>
      <h2 className="th__quoteTitle">{quote.title}</h2>
      <p className="th__quoteAmount">
        {won(quote.amount)} <span>부가세 포함</span>
      </p>
      {quote.weeks && <p className="th__quoteMeta">작업 기간 {quote.weeks}</p>}
      {quote.detail && <p className="th__quoteDetail">{quote.detail}</p>}

      {expired && !accepted ? (
        <p className="th__quoteNote">유효기간이 지난 견적입니다. 대화로 말씀해주시면 다시 보내드리겠습니다.</p>
      ) : accepted ? (
        <>
          {payable ? (
            <div className="th__quoteRow">
              <button className="th__pay" type="button" onClick={onPay}>
                결제하기 <span aria-hidden>→</span>
              </button>
              <button className="th__undo" type="button" onClick={() => accept(false)} disabled={busy}>
                확정 취소
              </button>
            </div>
          ) : (
            <p className="th__quoteNote">지금은 카드 결제를 열 수 없습니다. {BUSINESS.email}로 문의해주세요.</p>
          )}
          <p className="th__quoteNote">
            결제가 확인되면 바로 착수합니다. 착수 전에는 전액 환불되고, 착수 이후에는 진행된 부분을 제외하고
            환불됩니다.
          </p>
        </>
      ) : (
        <>
          <button className="th__pay" type="button" onClick={() => accept(true)} disabled={busy}>
            {busy ? "확정하는 중…" : "이 견적으로 확정"} <span aria-hidden>→</span>
          </button>
          <p className="th__quoteNote">
            확정하시면 결제 단계로 넘어갑니다. 확정한 금액은 이후에 바뀌지 않고, 결제 전까지는 확정을 되돌릴 수
            있습니다.
            {quote.expiresAt ? ` 유효기간 ${new Date(quote.expiresAt).toLocaleDateString("ko-KR")}까지.` : ""}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * 진행 상황.
 *
 * 단계는 서버가 사실에서 계산한 값이고, 막대는 아래 체크리스트를 센 것이다 —
 * 막대가 70%인데 목록은 둘만 체크돼 있으면 둘 중 하나는 거짓말이라, 같은 곳에서 센다.
 */
function ProgressPanel({ p }) {
  const at = p.stages.findIndex((s) => s.key === p.stage);
  return (
    <section className="th__prog">
      <div className="th__progHead">
        <p className="th__quoteLabel">진행 상황</p>
        {p.previewUrl && (
          <a className="th__preview" href={p.previewUrl} target="_blank" rel="noreferrer">
            지금 화면 보기 ↗
          </a>
        )}
      </div>

      <ol className="th__steps">
        {p.stages.map((s, i) => (
          <li
            key={s.key}
            className={`th__step${i < at ? " th__step--past" : ""}${i === at ? " th__step--now" : ""}`}
          >
            <span className="th__stepDot" aria-hidden />
            <span className="th__stepLabel">{s.label}</span>
          </li>
        ))}
      </ol>

      {(p.taskCount > 0 || p.percent > 0) && (
        <div className="th__bar">
          <div className="th__barFill" style={{ width: `${p.done ? 100 : p.percent}%` }} />
          <span className="th__barNum">
            {p.done ? "완료" : `${p.percent}%`}
            {p.taskCount > 0 && !p.done ? ` · ${p.taskDone}/${p.taskCount}` : ""}
          </span>
        </div>
      )}

      {p.tasks.length > 0 && (
        <ul className="th__tasks">
          {p.tasks.map((t) => (
            <li key={t.title} className={t.done ? "is-done" : t.doing ? "is-doing" : ""}>
              <span className="th__check" aria-hidden>
                {t.done ? "✓" : t.doing ? "◐" : "○"}
              </span>
              {t.title}
            </li>
          ))}
        </ul>
      )}

      {p.dueAt && !p.done && (
        <p className="th__quoteNote">예정 완료 {new Date(p.dueAt).toLocaleDateString("ko-KR")}</p>
      )}
      {p.tasks.length === 0 && p.stage === "build" && (
        <p className="th__quoteNote">작업을 시작했습니다. 세부 항목이 정리되는 대로 여기에 표시됩니다.</p>
      )}
    </section>
  );
}

/**
 * 결제 정보 입력 → 결제창.
 *
 * 이니시스는 결제자 이름·이메일·휴대폰이 없으면 창 자체를 열지 않는다. 그래서
 * 이 세 칸은 선택이 아니다. 금액은 받지 않는다 — 금액은 서버가 들고 있는 견적에서만 온다.
 */
function PaySheet({ quote, thread, token, onDone, onClose }) {
  const [form, setForm] = useState({ name: thread.name || "", email: "", phone: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pay = async (e) => {
    e.preventDefault();
    setError("");
    setState("busy");
    try {
      const order = await call(`/thread/quote/${quote.id}/checkout`, { method: "POST", token, body: form });
      const PortOne = await sdk();
      const res = await PortOne.requestPayment({
        storeId: order.storeId,
        channelKey: order.channelKey,
        paymentId: order.paymentId,
        orderName: order.orderName,
        totalAmount: order.totalAmount,
        currency: order.currency,
        payMethod: "CARD",
        customer: order.customer,
        // 모바일은 페이지를 떠났다가 돌아온다. 돌아올 곳을 지정하지 않으면 결과를 잃는다.
        redirectUrl: `${window.location.origin}/t?pay=${encodeURIComponent(quote.id)}${window.location.hash}`,
      });
      if (res?.code != null) {
        if (CANCEL_CODES.has(res.code)) {
          setState("idle");
          return;
        }
        throw new Error(res.message || "결제에 실패했어요.");
      }
      await call(`/thread/quote/${quote.id}/confirm`, { method: "POST", token, body: { paymentId: order.paymentId } });
      onDone();
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  };

  return (
    <div className="th__sheetWrap" role="dialog" aria-modal="true" aria-label="결제">
      <form className="th__sheet" onSubmit={pay}>
        <p className="th__sheetLabel">결제</p>
        <h2 className="th__sheetTitle">{quote.title}</h2>
        <p className="th__sheetAmount">{won(quote.amount)}</p>

        <label className="th__field">
          <span>결제자 성함</span>
          <input id="pay-name" value={form.name} onChange={set("name")} required maxLength={60} autoComplete="name" />
        </label>
        <label className="th__field">
          <span>영수증 받으실 이메일</span>
          <input id="pay-email" type="email" value={form.email} onChange={set("email")} required maxLength={200} autoComplete="email" />
        </label>
        <label className="th__field">
          <span>휴대폰 번호</span>
          <input id="pay-phone" type="tel" value={form.phone} onChange={set("phone")} required maxLength={20} placeholder="01012345678" autoComplete="tel" />
        </label>

        {error && <p className="th__sheetError">{error}</p>}

        <p className="th__sheetTerms">
          결제하시면 위 금액으로 개발 용역 계약이 성립합니다. 착수 전에는 전액 환불되며, 착수 이후에는 진행된
          부분을 제외하고 환불됩니다.
        </p>

        <div className="th__sheetRow">
          <button className="th__sheetGhost" type="button" onClick={onClose} disabled={state === "busy"}>
            취소
          </button>
          <button className="th__pay" type="submit" disabled={state === "busy"}>
            {state === "busy" ? "결제창을 여는 중…" : `${won(quote.amount)} 결제`}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 링크가 없거나 만료된 경우. 여기서 끝내지 않고 다시 받을 길을 준다. */
function NoLink({ expired }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const resend = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call("/thread/resend", { method: "POST", body: { email } });
    } catch {
      /* 서버는 있는지 없는지 알려 주지 않는다. 화면도 같은 답을 보여 준다. */
    }
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="th">
      <ThreadHead />
      <section className="th__gate">
        <h1>{expired ? "이 링크는 더 이상 열리지 않습니다" : "의뢰 대화를 열 수 없습니다"}</h1>
        <p>
          링크가 만료되었거나 주소가 정확하지 않습니다. 문의하실 때 쓰신 이메일을 적어주시면 새 링크를
          보내드립니다.
        </p>
        {sent ? (
          <p className="th__gateDone">
            해당 이메일로 접수된 의뢰가 있다면 새 링크를 보내드렸습니다. 메일함을 확인해주세요.
          </p>
        ) : (
          <form className="th__gateForm" onSubmit={resend}>
            <input
              id="gate-email"
              type="email"
              required
              value={email}
              maxLength={200}
              placeholder="문의하실 때 쓰신 이메일"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="th__pay" type="submit" disabled={busy}>
              {busy ? "보내는 중…" : "링크 다시 받기"}
            </button>
          </form>
        )}
        <p className="th__fine">
          이메일로 문의하지 않으셨다면 <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a> 또는{" "}
          <a href={telHref}>{BUSINESS.tel}</a>로 연락 주세요.
        </p>
        <p className="th__fine">
          <a href="/">← 리머 홈으로</a>
        </p>
      </section>
    </div>
  );
}
