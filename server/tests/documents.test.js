// 긴 문서 검사 — 나누기, 고친 문장 반영, 파일에서 글자 꺼내기.
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { applyFixes, splitDocument } from "../documentText.js";
import { extractFileText, FileTextError } from "../fileText.js";

test("문서를 문단 경계에서 나누고, 조각을 이으면 원문 그대로다", () => {
  const para = (n) => `${n}번째 문단입니다. `.repeat(40).trim();
  const text = Array.from({ length: 30 }, (_, i) => para(i + 1)).join("\n\n");
  const chunks = splitDocument(text, 2000, 10_000);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((c) => text.slice(c.start, c.end)).join(""), text, "빠지거나 겹치는 글자가 없어야 한다");
  for (const c of chunks) {
    assert.ok(c.end - c.start <= 10_000, "검증 한 건 상한을 넘지 않는다");
    assert.ok(c.start === 0 || text[c.start - 1] === "\n" || /\s/.test(text[c.start - 1]), "문단·공백 경계에서 자른다");
  }
});

test("짧은 문서는 한 조각, 공백만 있는 조각은 만들지 않는다", () => {
  assert.equal(splitDocument("짧은 보도자료 한 문단.").length, 1);
  assert.equal(splitDocument("   \n\n  ").length, 0);
});

test("고친 문장을 원문에 반영한다 — 위치가 맞는 것만, 겹치지 않게", () => {
  const text = "출시일은 2019년입니다. 수도는 부산입니다. 직원은 3명입니다.";
  const at = (s) => ({ start: text.indexOf(s), end: text.indexOf(s) + s.length });
  const claims = [
    { verdict: "false", quote: "수도는 부산입니다.", span: at("수도는 부산입니다."), suggested_fix: "수도는 서울입니다." },
    { verdict: "false", quote: "출시일은 2019년입니다.", span: at("출시일은 2019년입니다."), suggested_fix: "출시일은 2021년입니다." },
    { verdict: "confirmed", quote: "직원은 3명입니다.", span: at("직원은 3명입니다."), suggested_fix: "무시돼야 함" },
    // 위치와 발췌가 어긋나면(원문이 바뀐 경우) 반영하지 않는다.
    { verdict: "false", quote: "다른 문장", span: { start: 0, end: 5 }, suggested_fix: "X" },
  ];
  const out = applyFixes(text, claims);
  assert.equal(out.text, "출시일은 2021년입니다. 수도는 서울입니다. 직원은 3명입니다.");
  assert.equal(out.applied, 2);
});

// ── 파일 ──
// 테스트용으로 '저장(압축 없음)'·'deflate' 두 방식이 섞인 zip을 만든다.
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content, deflate] of files) {
    const data = Buffer.from(content, "utf8");
    const body = deflate ? zlib.deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("워드(DOCX) 본문 — 문단은 줄바꿈, 표 안 글자와 엔티티까지", async () => {
  const xml = `<w:document><w:body>
    <w:p><w:r><w:t>리머는 2026년</w:t></w:r><w:r><w:t xml:space="preserve"> 유메를 출시했습니다.</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>요금 &amp; 한도</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>끝</w:t><w:tab/><w:t>문단</w:t></w:r></w:p>
  </w:body></w:document>`;
  const buf = makeZip([["[Content_Types].xml", "<Types/>", false], ["word/document.xml", xml, true]]);
  const text = await extractFileText({ name: "보도자료.docx", buffer: buf });
  assert.equal(text, "리머는 2026년 유메를 출시했습니다.\n요금 & 한도\n끝\t문단");
});

test("한글(HWPX) 본문 — 구역 순서대로", async () => {
  const sec = (s) => `<hs:sec><hp:p><hp:run><hp:t>${s}</hp:t></hp:run></hp:p></hs:sec>`;
  const buf = makeZip([
    ["mimetype", "application/hwp+zip", false],
    ["Contents/section1.xml", sec("둘째 구역"), true],
    ["Contents/section0.xml", sec("첫째 구역"), true],
  ]);
  assert.equal(await extractFileText({ name: "안내문.hwpx", buffer: buf }), "첫째 구역\n\n둘째 구역");
});

test("옛 한글(HWP)·손상된 파일·빈 파일은 이유를 알려주고 거절한다", async () => {
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(extractFileText({ name: "옛문서.hwp", buffer: ole }), /HWPX/);
  await assert.rejects(extractFileText({ name: "깨짐.docx", buffer: Buffer.from("PK이상한") }), FileTextError);
  await assert.rejects(extractFileText({ name: "a.txt", buffer: Buffer.alloc(0) }), /빈 파일/);
  await assert.rejects(extractFileText({ name: "a.exe", buffer: Buffer.from("MZ") }), /지원하는 파일/);
});

test("텍스트 파일 — UTF-8과 EUC-KR(국내 기관 파일) 둘 다 읽는다", async () => {
  assert.equal(await extractFileText({ name: "a.txt", buffer: Buffer.from("﻿안녕하세요\r\n유메", "utf8") }), "안녕하세요\n유메");
  const euckr = Buffer.from([0xbe, 0xc8, 0xb3, 0xe7]); // "안녕"
  assert.equal(await extractFileText({ name: "b.txt", buffer: euckr }), "안녕");
});
