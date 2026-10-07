// 기업이 올린 파일에서 글자를 꺼낸다 — TXT·MD·CSV, DOCX(워드), HWPX(한글), PDF.
//
// 기업 문서는 붙여넣기가 아니라 파일로 온다. 특히 국내 기관·기업은 한글(HWP) 문서가 기본이라,
// 파일을 못 받으면 "복사해서 붙여 넣으세요"에서 대부분 그만둔다.
//
// DOCX와 HWPX는 둘 다 zip 안에 든 XML이다. 라이브러리를 들이지 않고 zip을 직접 읽는다 —
// 필요한 건 목록 읽기와 압축 풀기뿐이고, Node의 zlib이 압축을 푼다. 압축 폭탄(작은 파일이
// 수 GB로 풀리는 것)을 막으려고 풀린 크기에 상한을 둔다.
// 옛 HWP(바이너리)는 형식이 전혀 달라 받지 않고, HWPX로 저장해 달라고 안내한다.
import zlib from "node:zlib";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UNZIPPED = 60 * 1024 * 1024;

export class FileTextError extends Error {}

// ── zip ─────────────────────────────────────────────────────────────────────
function readZip(buf) {
  // 끝에서부터 '중앙 디렉터리 끝' 표식을 찾는다(뒤에 주석이 붙을 수 있어 최대 64KB를 훑는다).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FileTextError("파일이 손상되었거나 지원하지 않는 형식입니다.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new FileTextError("너무 큰 파일 형식(ZIP64)은 아직 지원하지 않습니다.");
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new FileTextError("파일이 손상되었습니다.");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  let unzipped = 0;
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (buf.readUInt32LE(e.local) !== 0x04034b50) throw new FileTextError("파일이 손상되었습니다.");
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const raw = buf.subarray(start, start + e.compSize);
      let out;
      if (e.method === 0) out = raw;
      else if (e.method === 8) {
        try {
          out = zlib.inflateRawSync(raw, { maxOutputLength: MAX_UNZIPPED - unzipped });
        } catch {
          throw new FileTextError("파일 안의 내용이 너무 크거나 손상되었습니다.");
        }
      } else throw new FileTextError("지원하지 않는 압축 방식입니다.");
      unzipped += out.length;
      return out.toString("utf8");
    },
  };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m,
    );

// XML을 순서대로 훑으며 글자 칸은 글자로, 문단 끝은 줄바꿈으로 바꾼다. 표 안 문단이 겹쳐 있어도
// 여는 태그·닫는 태그를 짝짓지 않고 나오는 순서대로만 보므로 깨지지 않는다.
function xmlText(xml, { text, tab, br, para }) {
  const re = new RegExp(`<${text}\\b[^>]*>([\\s\\S]*?)</${text}>|<${tab}\\b[^>]*/>|<${br}\\b[^>]*/>|</${para}>`, "g");
  let out = "";
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0].startsWith(`<${tab}`)) out += "\t";
    else out += "\n";
  }
  return out;
}

function docxText(buf) {
  const zip = readZip(buf);
  const xml = zip.read("word/document.xml");
  if (!xml) throw new FileTextError("워드 문서에서 본문을 찾지 못했습니다.");
  return xmlText(xml, { text: "w:t", tab: "w:tab", br: "w:br", para: "w:p" });
}

function hwpxText(buf) {
  const zip = readZip(buf);
  const sections = zip.names
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!sections.length) throw new FileTextError("한글 문서에서 본문을 찾지 못했습니다.");
  return sections.map((s) => xmlText(zip.read(s), { text: "hp:t", tab: "hp:tab", br: "hp:lineBreak", para: "hp:p" })).join("\n");
}

async function pdfText(buf) {
  let mod;
  try {
    mod = await import("unpdf");
  } catch {
    throw new FileTextError("PDF 읽기를 준비하지 못했습니다. 텍스트로 붙여 넣어 주세요.");
  }
  try {
    const pdf = await mod.getDocumentProxy(new Uint8Array(buf));
    const { text } = await mod.extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  } catch {
    throw new FileTextError("PDF에서 글자를 읽지 못했습니다. 스캔한 이미지 PDF라면 글자가 들어 있는 PDF로 다시 저장해 주세요.");
  }
}

// 텍스트 파일은 대부분 UTF-8이지만, 국내 기관 파일은 아직 EUC-KR(CP949)이 많다.
function plainText(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}

const tidy = (s) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function extractFileText({ name = "", buffer }) {
  if (!buffer?.length) throw new FileTextError("빈 파일입니다.");
  if (buffer.length > MAX_FILE_BYTES) throw new FileTextError(`파일은 ${MAX_FILE_BYTES / 1024 / 1024}MB까지 올릴 수 있습니다.`);
  const ext = (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
  const head = buffer.subarray(0, 8);
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isPdf = head.toString("latin1", 0, 5) === "%PDF-";
  // 옛 한글(HWP 5.0)은 OLE 복합 문서다. 표식(D0 CF 11 E0)으로 알아본다.
  const isOle = head.length >= 4 && head.readUInt32BE(0) === 0xd0cf11e0;

  let text;
  if (isPdf || ext === "pdf") text = await pdfText(buffer);
  else if (ext === "hwp" || isOle) throw new FileTextError("한글(HWP) 파일은 'HWPX'로 다른 이름으로 저장한 뒤 올려 주세요. (한글 > 파일 > 다른 이름으로 저장 > HWPX)");
  else if (ext === "hwpx") text = hwpxText(buffer);
  else if (ext === "docx" || (isZip && ext !== "hwpx")) text = docxText(buffer);
  else if (["txt", "md", "csv", "text", ""].includes(ext)) text = plainText(buffer);
  else throw new FileTextError("지원하는 파일: TXT·MD·CSV·DOCX·HWPX·PDF");

  text = tidy(text);
  if (!text) throw new FileTextError("파일에서 읽을 수 있는 글자가 없습니다.");
  return text;
}
