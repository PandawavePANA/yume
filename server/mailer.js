// 트랜잭션 메일(비밀번호 재설정 등) 발송. Resend(https://resend.com) HTTP API를 쓴다 —
// SMTP 라이브러리 없이 fetch 한 번이면 된다. RESEND_API_KEY와 MAIL_FROM(예:
// "유메 <no-reply@yume-reamer.com>", 해당 도메인은 Resend에서 인증 필요)이 없으면
// 실제로 보내지 않고 서버 콘솔에만 남긴다(로컬 개발용).
export function mailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, html, text }) {
  if (!mailConfigured()) {
    console.log(`\n[메일 미설정 — 실제 발송 안 함]\n받는 사람: ${to}\n제목: ${subject}\n${text || html}\n`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`메일 발송 실패 (${res.status}): ${body.slice(0, 200)}`);
  }
  return { sent: true };
}
