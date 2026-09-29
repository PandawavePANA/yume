// 트랜잭션 메일(비밀번호 재설정 등) 발송. Resend(https://resend.com) HTTP API를 쓴다 —
// SMTP 라이브러리 없이 fetch 한 번이면 된다. RESEND_API_KEY와 MAIL_FROM(예:
// "유메 <no-reply@yume-reamer.com>", 해당 도메인은 Resend에서 인증 필요)이 없으면
// 실제로 보내지 않고 서버 콘솔에만 남긴다(로컬 개발용).
export function mailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

// replyTo는 "받은 메일에서 그냥 답장"이 되게 한다. 문의 알림이 no-reply 주소에서
// 오면 답장 버튼이 쓸모없어서, 보낸 사람 주소를 손으로 복사해 새 메일을 써야 한다.
// 회신이 한 번에 되느냐가 리드 응답 속도를 그대로 좌우한다.
// 보내는 사람 이름. 한 서버가 유메와 리머 메일을 같이 보내는데, MAIL_FROM이 하나뿐이라
// 리머 의뢰인이 받는 메일에도 그 이름(예: 다른 제품명)이 찍혔다. 브랜드마다 따로 둔다.
//   MAIL_FROM_REAMER / MAIL_FROM_YUME 가 있으면 그것을 쓴다(각 도메인을 Resend에서 인증한 뒤).
//   없으면 MAIL_FROM의 주소는 그대로 두고 **이름만** 바꾼다 — 주소는 인증된 것만 쓸 수 있지만
//   이름은 자유다. 받는 사람이 처음 보는 것이 이름이다.
const BRAND_NAME = { REAMER: "리머", YUME: "유메" };
export function fromFor(brand) {
  const own = brand && process.env[`MAIL_FROM_${brand}`];
  if (own) return own;
  const base = process.env.MAIL_FROM || "";
  const name = BRAND_NAME[brand];
  if (!name) return base;
  const m = /<([^>]+)>/.exec(base);
  const addr = m ? m[1] : base.trim();
  return addr ? `${name} <${addr}>` : base;
}

export async function sendMail({ to, subject, html, text, replyTo, brand = null }) {
  if (!mailConfigured()) {
    console.log(`\n[메일 미설정 — 실제 발송 안 함]\n받는 사람: ${to}\n제목: ${subject}\n${text || html}\n`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromFor(brand),
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: [replyTo] } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`메일 발송 실패 (${res.status}): ${body.slice(0, 200)}`);
  }
  return { sent: true };
}
