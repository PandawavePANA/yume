import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 유메의 영구 저장소 — PostgreSQL.
//   · 운영: Supabase Postgres (DATABASE_URL). 백업·복구는 Supabase가 맡는다.
//   · 로컬 개발·테스트: DATABASE_URL이 없으면 PGlite(WASM으로 돌아가는 진짜 Postgres)를
//     data/pglite에 띄운다. SQL은 두 경우 모두 똑같이 Postgres 문법이다.
//
// 테이블은 전부 전용 스키마 `yume`에 만든다. Supabase는 public 스키마를 REST API(anon 키)로
// 자동 공개하므로, 회원·검증 기록이 거기로 새지 않도록 public을 쓰지 않는다. 추가로 모든
// 테이블에 RLS를 켜서(정책 없음 = 전부 거부) 테이블 소유자인 서버 외에는 접근할 수 없게 한다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
export const USING_POSTGRES_URL = !!process.env.DATABASE_URL;
export const PERSISTENT_STORAGE = USING_POSTGRES_URL;
const SCHEMA = "yume";

let driver; // { query(text, params), transaction(fn), close(), describe }

async function openDriver() {
  if (USING_POSTGRES_URL) {
    const { default: pg } = await import("pg");
    pg.types.setTypeParser(20, (v) => (v == null ? null : Number(v))); // int8 → number (ms 타임스탬프·COUNT)
    const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Supabase는 TLS 필수. CA 인증서를 주면 검증까지 하고, 없으면 암호화만 한다.
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : ca ? { ca } : { rejectUnauthorized: false },
    });
    pool.on("error", (e) => console.error("Postgres 풀 오류:", e.message));
    // 연결마다 처음 한 번 search_path를 yume으로 맞춘다. 세션 단위 설정이라 Supabase의
    // Session pooler(5432) 또는 직접 연결을 써야 한다(Transaction pooler 6543은 유지되지 않음).
    async function withClient(fn) {
      const client = await pool.connect();
      try {
        if (!client.yumeReady) {
          await client.query(`SET search_path TO ${SCHEMA}`);
          client.yumeReady = true;
        }
        return await fn(client);
      } finally {
        client.release();
      }
    }
    return {
      describe: "Supabase/PostgreSQL",
      query: (text, params) => withClient((c) => c.query(text, params)),
      transaction: (fn) =>
        withClient(async (client) => {
          await client.query("BEGIN");
          try {
            const out = await fn((text, params) => client.query(text, params));
            await client.query("COMMIT");
            return out;
          } catch (e) {
            await client.query("ROLLBACK").catch(() => {});
            throw e;
          }
        }),
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || path.join(DATA_DIR, "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir === "memory://" ? undefined : dir);
  await lite.waitReady;
  await lite.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await lite.query(`SET search_path TO ${SCHEMA}`);
  // PGlite는 연결이 하나뿐이라 트랜잭션끼리 겹치지 않도록 줄 세운다.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };
  // 파라미터 없는 호출(마이그레이션처럼 여러 문장)은 exec, 나머지는 query로 보낸다.
  const run1 = (target, text, params) =>
    params === undefined ? target.exec(text).then((rs) => rs[rs.length - 1] || { rows: [] }) : target.query(text, params);
  return {
    describe: `PGlite (${dir})`,
    query: (text, params) => serial(() => run1(lite, text, params)),
    transaction: (fn) => serial(() => lite.transaction((txn) => fn((text, params) => run1(txn, text, params)))),
    close: () => lite.close(),
  };
}

// 테이블 이름 앞에 스키마를 붙인다. search_path(세션 설정)에 기대지 않아야 Supabase의
// Transaction pooler(6543)처럼 요청마다 다른 연결을 쓰는 경우에도 똑같이 동작한다.
const TABLES = [
  "users", "sessions", "password_resets", "api_keys", "api_usage", "verifications", "claims", "usage_daily",
  "wallets", "chat_messages", "error_logs", "audit_logs", "data_exports", "settings", "schema_migrations",
];
const TABLE_REF = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${TABLES.join("|")})\\b`, "gi");
const qualify = (sql) => sql.replace(TABLE_REF, (_m, kw, table) => `${kw} ${SCHEMA}.${table}`);

// ── :name 형태의 이름 있는 파라미터를 Postgres의 $1, $2…로 바꾼다(작은따옴표 문자열 안은 건드리지 않음). ──
const compiled = new Map();
function compile(rawSql) {
  let hit = compiled.get(rawSql);
  if (hit) return hit;
  const sql = qualify(rawSql);
  const names = [];
  let out = "";
  let inQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") inQuote = !inQuote;
    if (!inQuote && ch === ":" && sql[i + 1] !== ":" && sql[i - 1] !== ":" && /[A-Za-z_]/.test(sql[i + 1] || "")) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      const name = sql.slice(i + 1, j);
      let idx = names.indexOf(name);
      if (idx === -1) {
        names.push(name);
        idx = names.length - 1;
      }
      out += `$${idx + 1}`;
      i = j - 1;
      continue;
    }
    out += ch;
  }
  hit = { text: out, names };
  compiled.set(rawSql, hit);
  return hit;
}

function bind(sql, params = {}) {
  const { text, names } = compile(sql);
  const values = names.map((n) => {
    if (!(n in params)) throw new Error(`SQL 파라미터 누락: :${n}`);
    const v = params[n];
    return v === undefined ? null : v;
  });
  return [text, values];
}

function makeApi(exec) {
  return {
    one: async (sql, params) => (await exec(...bind(sql, params))).rows[0],
    all: async (sql, params) => (await exec(...bind(sql, params))).rows,
    run: async (sql, params) => {
      const r = await exec(...bind(sql, params));
      return { changes: r.rowCount ?? r.affectedRows ?? 0, rows: r.rows };
    },
  };
}

// 스키마 마이그레이션 — 순서대로 한 번씩만 적용. 배포된 뒤에는 기존 항목을 고치지 말고 뒤에 추가할 것.
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_expires_at BIGINT,
    data_consent INTEGER NOT NULL DEFAULT 0,
    data_consent_at BIGINT,
    terms_agreed_at BIGINT NOT NULL,
    privacy_agreed_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    last_login_at BIGINT
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT
  );

  CREATE TABLE api_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    monthly_quota INTEGER NOT NULL,
    rate_per_min INTEGER NOT NULL DEFAULT 30,
    data_sharing INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at BIGINT NOT NULL,
    last_used_at BIGINT,
    revoked_at BIGINT
  );
  CREATE INDEX idx_api_keys_user ON api_keys(user_id);

  CREATE TABLE api_usage (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    verification_id TEXT,
    endpoint TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    billable INTEGER NOT NULL DEFAULT 0,
    cached INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_api_usage_key_time ON api_usage(api_key_id, created_at);

  CREATE TABLE verifications (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
    client_key TEXT,
    input TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT,
    overall_domain TEXT,
    overall_tone TEXT,
    claim_count INTEGER NOT NULL DEFAULT 0,
    false_count INTEGER NOT NULL DEFAULT 0,
    uncertain_count INTEGER NOT NULL DEFAULT 0,
    from_cache INTEGER NOT NULL DEFAULT 0,
    data_consent INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    elapsed_ms INTEGER,
    created_at BIGINT NOT NULL,
    completed_at BIGINT
  );
  CREATE INDEX idx_verif_hash ON verifications(input_hash, created_at);
  CREATE INDEX idx_verif_user ON verifications(user_id, created_at);
  CREATE INDEX idx_verif_created ON verifications(created_at);
  CREATE INDEX idx_verif_client ON verifications(client_key, created_at);

  CREATE TABLE claims (
    id BIGSERIAL PRIMARY KEY,
    verification_id TEXT NOT NULL REFERENCES verifications(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    domain TEXT,
    verdict TEXT,
    verified_via TEXT,
    explanation TEXT,
    sources_json TEXT,
    legal_ref_json TEXT,
    nec_json TEXT,
    nec_score DOUBLE PRECISION,
    nec_grade TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_claims_verif ON claims(verification_id);
  CREATE INDEX idx_claims_domain ON claims(domain, verdict);
  CREATE INDEX idx_claims_created ON claims(created_at);

  CREATE TABLE usage_daily (
    client_key TEXT NOT NULL,
    day TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (client_key, day)
  );

  CREATE TABLE wallets (
    client_key TEXT PRIMARY KEY,
    tokens INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
  );

  CREATE TABLE chat_messages (
    id BIGSERIAL PRIMARY KEY,
    channel TEXT NOT NULL,
    client_key TEXT NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_chat_client ON chat_messages(client_key, created_at);
  CREATE INDEX idx_chat_created ON chat_messages(created_at);

  CREATE TABLE error_logs (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_errors_created ON error_logs(created_at);

  CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    detail_json TEXT,
    ip TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_audit_created ON audit_logs(created_at);

  CREATE TABLE data_exports (
    id BIGSERIAL PRIMARY KEY,
    buyer TEXT NOT NULL,
    purpose TEXT NOT NULL,
    filters_json TEXT NOT NULL,
    format TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    content TEXT,
    sha256 TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at BIGINT NOT NULL,
    max_downloads INTEGER NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    price_krw INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    last_download_at BIGINT
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  DO $$
  DECLARE t record;
  BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'yume' LOOP
      EXECUTE format('ALTER TABLE yume.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON SCHEMA yume FROM anon, authenticated';
    END IF;
  END $$;
  `,
];

async function migrate() {
  await driver.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await driver.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)`);
  const { rows } = await driver.query(`SELECT COALESCE(MAX(version), 0) AS v FROM ${SCHEMA}.schema_migrations`);
  for (let v = Number(rows[0].v); v < MIGRATIONS.length; v += 1) {
    await driver.transaction(async (q) => {
      await q(`SET LOCAL search_path TO ${SCHEMA}`);
      // 여러 인스턴스가 동시에 떠도 마이그레이션은 한 번만 돌도록 잠근다.
      await q("SELECT pg_advisory_xact_lock(81720913)");
      const again = await q(`SELECT 1 FROM ${SCHEMA}.schema_migrations WHERE version = $1`, [v + 1]);
      if (again.rows.length) return;
      await q(MIGRATIONS[v]);
      await q(`INSERT INTO ${SCHEMA}.schema_migrations (version, applied_at) VALUES ($1, $2)`, [v + 1, Date.now()]);
    });
  }
}

driver = await openDriver();
await migrate();

export const DB_DESCRIPTION = driver.describe;
export const { one, all, run } = makeApi((text, values) => driver.query(text, values));

// 트랜잭션 안에서는 인자로 받은 { one, all, run }을 써야 같은 연결·같은 트랜잭션으로 묶인다.
export function tx(fn) {
  return driver.transaction((exec) => fn(makeApi(exec)));
}

export const now = () => Date.now();

// KST 기준 날짜 문자열 — 무료 한도가 한국 자정에 초기화되도록.
export function kstDay(ts = Date.now()) {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function kstMonthStart(ts = Date.now()) {
  const d = new Date(ts + 9 * 3600 * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 9 * 3600 * 1000;
}

export async function closeDb() {
  try {
    await driver.close();
  } catch {
    /* 이미 닫힘 */
  }
}
