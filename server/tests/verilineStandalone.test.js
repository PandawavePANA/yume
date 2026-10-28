// 베리라인 독립(2026-10-29) — 고객에게 나가는 주소 · 메일에 옛 주소(yume-reamer.com)와 리머 외주가 섞이지 않는다.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { siteOrigin, LEGACY_HOSTS } from "../site.js";
import { veriLineReceiptMail } from "../verilineMail.js";
import { fromFor } from "../mailer.js";
import { closeDb } from "../db.js";

// renderPages가 끌어오는 모듈이 DB를 열 수 있어, 끝나면 닫아 프로세스가 내려가게 한다.
after(async () => {
  await closeDb();
});

test("주소: 환경변수에 옛 주소가 남아 있어도 veriline.kr을 쓴다", () => {
  const was = process.env.PUBLIC_BASE_URL;
  try {
    process.env.PUBLIC_BASE_URL = "https://www.yume-reamer.com/";
    assert.equal(siteOrigin(), "https://veriline.kr");
    delete process.env.PUBLIC_BASE_URL;
    assert.equal(siteOrigin(), "https://veriline.kr");
    process.env.PUBLIC_BASE_URL = "https://staging.veriline.kr/";
    assert.equal(siteOrigin(), "https://staging.veriline.kr");
  } finally {
    if (was === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = was;
  }
  assert.ok(LEGACY_HOSTS.has("www.yume-reamer.com"));
});

test("무료 진단 접수 메일: 베리라인 이름 · 접수 번호 · 다음 단계, 리머 · 옛 주소 없음", () => {
  const m = veriLineReceiptMail({ id: 42, name: "김담당", kind: "veriline_diagnosis", company: "가나다" });
  assert.match(m.subject, /^\[베리라인\] 무료 진단 신청을 받았습니다 · VL-D-42$/);
  for (const body of [m.text, m.html]) {
    assert.match(body, /영업일 3일/);
    assert.match(body, /contact@veriline\.kr/);
    assert.doesNotMatch(body, /yume-reamer|d-reamer|대화 열기|유메/);
  }
});

test("메일 보내는 이름: 예전 YUME로 불러도 베리라인", () => {
  const was = process.env.MAIL_FROM;
  try {
    process.env.MAIL_FROM = "알림 <no-reply@example.com>";
    assert.equal(fromFor("YUME"), "베리라인 <no-reply@example.com>");
    assert.equal(fromFor("VERILINE"), "베리라인 <no-reply@example.com>");
  } finally {
    if (was === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = was;
  }
});
