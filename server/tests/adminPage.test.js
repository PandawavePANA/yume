// 운영 대시보드 페이지가 브라우저에서 실제로 실행되는지.
//
// 이 파일(renderAdminPage.js)은 전체가 하나의 템플릿 문자열이라, 안쪽 문자열의 역슬래시를
// 하나만 쓰면 서버는 아무 오류 없이 페이지를 내보내고 브라우저에서만 문법 오류가 난다.
// 그 순간 대시보드 전체가 빈 화면이 되는데, 서버 테스트로는 절대 안 잡힌다.
// 그래서 페이지 안의 스크립트를 실제로 파싱해 본다.
import test from "node:test";
import assert from "node:assert/strict";
import { renderAdminPage } from "../renderAdminPage.js";

const html = renderAdminPage();

test("페이지 안의 스크립트가 파싱된다", () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, "스크립트가 있어야 데이터를 채운다");
  for (const [i, blk] of blocks.entries()) {
    assert.doesNotThrow(() => new Function(blk[1]), `script #${i} 문법 오류`);
  }
});

test("검토해야 할 것들이 화면에 있다", () => {
  // 검토 화면에서 빠지면 그 접수함은 아무도 열지 않는 상태로 쌓인다.
  for (const panel of ["제보 검토", "판정 정정 검토", "상품 교환", "추천 확인"]) {
    assert.ok(html.includes(panel), `${panel} 패널이 없다`);
  }
});
