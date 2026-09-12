import crypto from "node:crypto";
import { all, now, one, run } from "./db.js";
import { randomToken, sha256 } from "./security.js";

// 데이터셋 판매(라이선싱) — "AI 할루시네이션 판정 데이터셋".
//
// 개인정보보호법 준수를 위해 다음 원칙을 코드로 강제한다.
//  1) 동의한 데이터만: 로그인 사용자가 [선택] 데이터 활용에 동의한 상태에서 만든 검증,
//     또는 계약상 데이터 제공이 허용된 API 키(data_sharing)로 들어온 검증만 포함한다.
//     익명 사용자·카카오 채널 데이터는 동의 절차가 없으므로 절대 포함하지 않는다.
//     동의를 철회하거나 탈퇴하면 이후 반출에서 즉시 빠진다(반출 시점에 다시 확인).
//  2) 원문은 내보내지 않는다: 사용자가 붙여넣은 입력 전문 대신, 유메가 추출한 주장 단위
//     문장·판정·근거만 내보낸다.
//  3) 가명처리: 이메일·전화번호·주민등록번호·카드·계좌번호·주소 번지·호칭이 붙은 이름을
//     마스킹하고, 레코드 ID는 비밀 솔트로 만든 해시(재식별 불가), 시각은 월 단위로만 남긴다.
//  4) 반출 기록: 누구에게 어떤 목적으로 몇 건을 줬는지 data_exports·audit_logs에 남긴다.
// 반출 파일은 DB(data_exports.content)에 보관한다 — 서버 디스크에 의존하지 않도록.

async function datasetSalt() {
  if (process.env.DATASET_SALT) return process.env.DATASET_SALT;
  // 솔트가 바뀌면 같은 레코드의 ID가 달라져 구매자 쪽 중복 제거가 깨지므로, 환경변수가
  // 없으면 DB에 한 번 만들어 계속 재사용한다.
  await run("INSERT INTO settings (key, value) VALUES ('dataset_salt', :v) ON CONFLICT (key) DO NOTHING", { v: randomToken(32) });
  return (await one("SELECT value FROM settings WHERE key = 'dataset_salt'")).value;
}

// ───────────────────────── 가명처리 ─────────────────────────
const PATTERNS = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일]"],
  [/\b\d{6}\s?-\s?[1-8]\d{6}\b/g, "[주민등록번호]"],
  [/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[전화번호]"],
  [/\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, "[전화번호]"],
  [/\b(?:\d{4}[-\s]){3}\d{4}\b/g, "[카드번호]"],
  // 날짜(2020-12-10)는 살리고, 숫자가 10자리 이상인 하이픈 묶음만 계좌번호로 본다.
  [/\b\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,4})?\b/g, (m) => (m.replace(/-/g, "").length >= 10 ? "[계좌번호]" : m)],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]"],
  [/([가-힣]+(?:로|길))\s?\d+(?:번길\s?\d+)?(?:-\d+)?/g, "$1 [번지]"],
  [/([가-힣]+동)\s?\d+(?:-\d+)?번지/g, "$1 [번지]"],
  [/(\d+)동\s?(\d+)호/g, "[동·호수]"],
];
// 사람 이름: 흔한 성씨로 시작하는 2~4음절 + 호칭("김철수 씨는"), 또는 당사자 지위 + 이름
// ("피해자 김철수는"). 성씨 조건을 둬서 "성범죄 피해자" 같은 일반 명사는 건드리지 않는다.
const SURNAMES = "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민";
const PARTICLE = "(?=$|[^가-힣]|은|는|이|가|의|을|를|에|께|도|와|과|로|만)";
const NAME_HONORIFIC = new RegExp(`(^|[^가-힣])([${SURNAMES}][가-힣]{1,3})(\\s?)(씨|님|변호사|판사|검사|교수)${PARTICLE}`, "g");
const PARTY_NAME = new RegExp(`(원고|피고|고소인|피고소인|신청인|피신청인|피해자|가해자|채권자|채무자|의뢰인)(\\s+)([${SURNAMES}][가-힣]{1,2})${PARTICLE}`, "g");

export function redact(text) {
  let s = String(text || "");
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  s = s.replace(NAME_HONORIFIC, (m, pre, _name, sp, title) => `${pre}○○○${sp}${title}`);
  s = s.replace(PARTY_NAME, (m, title, sp) => `${title}${sp}○○○`);
  return s;
}

// 공공기관·학술 레지스트리 링크는 쿼리가 곧 문서 ID라(예: law.go.kr의 MST) 남기고,
// 그 밖의 사이트는 추적·세션 토큰이 섞일 수 있어 쿼리를 지운다.
const KEEP_QUERY_HOSTS = [/\.go\.kr$/, /^doi\.org$/, /(^|\.)arxiv\.org$/, /^pubmed\.ncbi\.nlm\.nih\.gov$/, /^openlibrary\.org$/];

function redactSources(sources) {
  return (sources || []).map((s) => {
    let url = s.url || null;
    try {
      if (url) {
        const u = new URL(url);
        if (!KEEP_QUERY_HOSTS.some((re) => re.test(u.hostname))) u.search = "";
        u.hash = "";
        url = u.toString();
      }
    } catch {
      url = null;
    }
    return { title: redact(s.title || ""), url };
  });
}

// ───────────────────────── 대상 선정 ─────────────────────────
const ELIGIBLE_WHERE = `
  v.status = 'done' AND v.data_consent = 1 AND v.from_cache = 0
  AND (
    (v.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = v.user_id AND u.data_consent = 1 AND u.status = 'active'))
    OR (v.api_key_id IS NOT NULL AND EXISTS (SELECT 1 FROM api_keys k WHERE k.id = v.api_key_id AND k.data_sharing = 1))
  )`;

function filterClause(f = {}, params) {
  const parts = [ELIGIBLE_WHERE];
  if (Array.isArray(f.domains) && f.domains.length) {
    parts.push(`c.domain IN (${f.domains.map((_, i) => `:d${i}`).join(",")})`);
    f.domains.forEach((d, i) => (params[`d${i}`] = d));
  }
  if (Array.isArray(f.verdicts) && f.verdicts.length) {
    parts.push(`c.verdict IN (${f.verdicts.map((_, i) => `:v${i}`).join(",")})`);
    f.verdicts.forEach((v, i) => (params[`v${i}`] = v));
  }
  if (f.from) {
    parts.push("c.created_at >= :from");
    params.from = Number(f.from);
  }
  if (f.to) {
    parts.push("c.created_at < :to");
    params.to = Number(f.to);
  }
  if (f.onlyOfficial) parts.push("c.verified_via IN ('official','nec')");
  return parts.join(" AND ");
}

export async function datasetStats() {
  const byDomainVerdict = await all(
    `SELECT c.domain, c.verdict, COUNT(*) AS n FROM claims c JOIN verifications v ON v.id = c.verification_id
      WHERE ${ELIGIBLE_WHERE} GROUP BY c.domain, c.verdict ORDER BY n DESC`,
  );
  const total = byDomainVerdict.reduce((s, r) => s + r.n, 0);
  const allClaims = (await one("SELECT COUNT(*) AS n FROM claims")).n;
  const necCount = (await one(`SELECT COUNT(*) AS n FROM claims c JOIN verifications v ON v.id = c.verification_id WHERE ${ELIGIBLE_WHERE} AND c.nec_json IS NOT NULL`)).n;
  const consentingUsers = (await one("SELECT COUNT(*) AS n FROM users WHERE data_consent = 1 AND status = 'active'")).n;
  const sharingKeys = (await one("SELECT COUNT(*) AS n FROM api_keys WHERE data_sharing = 1 AND status = 'active'")).n;
  return { eligibleClaims: total, totalClaims: allClaims, necClaims: necCount, consentingUsers, sharingKeys, byDomainVerdict };
}

function toRecord(row, salt) {
  const month = new Date(row.created_at + 9 * 3600 * 1000).toISOString().slice(0, 7);
  const nec = row.nec_json ? JSON.parse(row.nec_json) : null;
  return {
    record_id: crypto.createHmac("sha256", salt).update(`claim:${row.id}`).digest("hex").slice(0, 20),
    month,
    channel: row.source,
    domain: row.domain,
    claim: redact(row.text),
    verdict: row.verdict,
    verified_via: row.verified_via,
    explanation: redact(row.explanation || ""),
    sources: redactSources(JSON.parse(row.sources_json || "[]")),
    legal_ref: row.legal_ref_json ? JSON.parse(row.legal_ref_json) : null,
    non_existence: nec
      ? {
          identifier_type: nec.identifier?.type,
          identifier: nec.identifier?.canonical,
          nec_score: nec.score,
          grade: nec.grade,
          coverage: nec.coverage?.value,
          format_error: nec.formatError?.value,
          proximity: nec.proximity?.value,
        }
      : null,
  };
}

async function queryRecords(filters = {}, limit = null) {
  const params = {};
  const where = filterClause(filters, params);
  const sql = `SELECT c.*, v.source FROM claims c JOIN verifications v ON v.id = c.verification_id
                WHERE ${where} ORDER BY c.id ASC ${limit ? "LIMIT :limit" : ""}`;
  if (limit) params.limit = limit;
  const rows = await all(sql, params);
  const salt = await datasetSalt();
  let records = rows.map((r) => toRecord(r, salt));
  if (filters.dedupe) {
    const seen = new Set();
    records = records.filter((r) => {
      const k = `${r.domain}|${r.claim}|${r.verdict}`;
      return seen.has(k) ? false : seen.add(k);
    });
  }
  return records;
}

export async function previewDataset(filters = {}) {
  const params = {};
  const where = filterClause(filters, params);
  const count = (await one(`SELECT COUNT(*) AS n FROM claims c JOIN verifications v ON v.id = c.verification_id WHERE ${where}`, params)).n;
  return { count, sample: await queryRecords(filters, 20) };
}

const CSV_COLUMNS = ["record_id", "month", "channel", "domain", "claim", "verdict", "verified_via", "explanation", "sources", "legal_ref", "non_existence"];
function csvCell(v) {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function createExport({ buyer, purpose, filters = {}, format = "jsonl", priceKrw = null, validDays = 7, maxDownloads = 5, actor }) {
  if (!buyer || !purpose) return { error: "구매처와 제공 목적을 입력해주세요." };
  const records = await queryRecords(filters);
  if (records.length === 0) return { error: "조건에 맞는 동의 데이터가 없습니다." };
  const fmt = format === "csv" ? "csv" : "jsonl";
  const body =
    fmt === "csv"
      ? "﻿" + [CSV_COLUMNS.join(","), ...records.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n")
      : records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const fileName = `yume-dataset-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString("hex")}.${fmt}`;
  const token = randomToken(32);
  const t = now();
  const r = await run(
    `INSERT INTO data_exports (buyer, purpose, filters_json, format, record_count, file_name, content, sha256, token_hash, expires_at,
                               max_downloads, price_krw, created_by, created_at)
     VALUES (:buyer, :purpose, :filters, :fmt, :count, :file, :content, :sha, :th, :exp, :maxd, :price, :actor, :t) RETURNING id`,
    {
      buyer: String(buyer).slice(0, 120),
      purpose: String(purpose).slice(0, 300),
      filters: JSON.stringify(filters),
      fmt,
      count: records.length,
      file: fileName,
      content: body,
      sha: crypto.createHash("sha256").update(body).digest("hex"),
      th: sha256(token),
      exp: t + Math.max(1, Math.min(30, Number(validDays) || 7)) * 24 * 3600 * 1000,
      maxd: Math.max(1, Math.min(50, Number(maxDownloads) || 5)),
      price: priceKrw == null || priceKrw === "" ? null : Math.max(0, Math.floor(Number(priceKrw))),
      actor,
      t,
    },
  );
  return { id: r.rows[0].id, token, recordCount: records.length, fileName };
}

export async function listExports(limit = 100) {
  const rows = await all(
    `SELECT id, buyer, purpose, filters_json, format, record_count, file_name, sha256, expires_at, max_downloads, download_count,
            price_krw, status, created_by, created_at, last_download_at
       FROM data_exports ORDER BY id DESC LIMIT :limit`,
    { limit },
  );
  return rows.map((e) => ({ ...e, filters: JSON.parse(e.filters_json) }));
}

export async function revokeExport(id) {
  return (await run("UPDATE data_exports SET status = 'revoked' WHERE id = :id", { id })).changes > 0;
}

// 구매자가 받은 링크로 내려받는다. 만료·횟수 초과·회수된 링크는 거절.
export async function openExportDownload(token) {
  const e = token ? await one("SELECT * FROM data_exports WHERE token_hash = :h", { h: sha256(token) }) : null;
  if (!e) return { error: "링크가 올바르지 않습니다.", status: 404 };
  if (e.status !== "active") return { error: "회수된 링크입니다.", status: 410 };
  if (e.expires_at < now()) return { error: "만료된 링크입니다.", status: 410 };
  if (e.content == null) return { error: "보관 기간이 지나 파일이 삭제되었습니다.", status: 410 };
  // 동시에 여러 번 눌러도 횟수를 넘지 않도록 조건부로 증가시킨다.
  const bumped = await run(
    "UPDATE data_exports SET download_count = download_count + 1, last_download_at = :t WHERE id = :id AND download_count < max_downloads",
    { id: e.id, t: now() },
  );
  if (bumped.changes === 0) return { error: "다운로드 가능 횟수를 모두 사용했습니다.", status: 410 };
  return { content: e.content, fileName: e.file_name, format: e.format, exportRow: e };
}

// 만료 후 한 달이 지난 반출 파일 내용은 지운다(기록 행은 남긴다).
export function purgeOldExportFiles() {
  return run("UPDATE data_exports SET content = NULL WHERE expires_at < :cutoff AND content IS NOT NULL", { cutoff: now() - 30 * 24 * 3600 * 1000 });
}
