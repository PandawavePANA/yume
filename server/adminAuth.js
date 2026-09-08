import crypto from "node:crypto";

// 관리자 대시보드(/admin, /api/admin/*)는 사용자 IP·카카오 대화량·발급된 API
// 키 목록처럼 외부에 공개하면 안 되는 운영 정보를 보여주므로 별도 키로 막는다.
// 실 배포에서는 ADMIN_SECRET 환경변수로 직접 정해서 쓰고, 로컬에서 그냥 켜서
// 볼 때는(환경변수 없음) 서버가 뜰 때마다 임시 키를 하나 만들어 콘솔에 찍어준다
// — 그 값을 대시보드 로그인 화면에 붙여넣으면 된다.
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(9).toString("base64url");
if (!process.env.ADMIN_SECRET) {
  console.log(`\n[관리자 대시보드] ADMIN_SECRET 환경변수가 없어 임시 키를 생성했습니다.`);
  console.log(`[관리자 대시보드] /admin 페이지에서 이 키로 로그인하세요: ${ADMIN_SECRET}\n`);
}

export function requireAdmin(req, res, next) {
  const key = req.get("x-admin-key") || req.query.key;
  if (key !== ADMIN_SECRET) {
    return res.status(401).json({ error: "관리자 키가 올바르지 않아요." });
  }
  next();
}
