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
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!mailConfigured()) {
    console.log(`\n[메일 미설정 — 실제 발송 안 함]\n받는 사람: ${to}\n제목: ${subject}\n${text || html}\n`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
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
