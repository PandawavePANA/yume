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
  // 나중에 추가된 테이블. 여기 빠지면 search_path에 기대게 되어 위 주석의 문제가 그대로 생긴다.
  "credit_ledger", "bounty_claims", "redemptions", "referrals", "contribution_ledger", "quarter_awards", "claim_cache",
  "credit_orders", "inquiries", "audit_sessions", "audit_reports", "projects", "product_tasks",
  "threads", "thread_messages", "thread_quotes", "lobby_messages", "api_costs", "verdict_corrections",
  "api_idempotency", "documents", "trust_marks",
  "ai_audits", "ai_audit_items", "ai_audit_findings", "ai_audit_files", "audit_outcomes", "index_issues",
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
  // 크레딧 — 제보 보상·추천 보상으로 쌓이고 상품 교환으로 빠져나간다.
  // 잔액은 따로 들고 있지 않고 원장(credit_ledger)의 합으로만 구한다. 지급·차감 경위가
  // 전부 남아야 정산·분쟁 대응이 되기 때문이고, 합계가 음수로 내려가지 않게 하는 건
  // 차감하는 쪽(credits.spend)에서 트랜잭션으로 막는다.
  `
  CREATE TABLE credit_ledger (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    memo TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_credit_user ON credit_ledger(user_id, id);

  CREATE TABLE bounty_claims (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_id TEXT REFERENCES verifications(id) ON DELETE SET NULL,
    claim_idx INTEGER,
    platform TEXT NOT NULL,
    share_url TEXT NOT NULL,
    dedup_key TEXT NOT NULL,
    identifier_type TEXT,
    identifier_value TEXT,
    claim_text TEXT NOT NULL,
    nec_score DOUBLE PRECISION,
    nec_grade TEXT,
    link_check TEXT,
    link_check_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    credits INTEGER NOT NULL DEFAULT 0,
    reviewer_note TEXT,
    reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at BIGINT,
    created_at BIGINT NOT NULL
  );
  -- 같은 플랫폼에서 같은 가짜 인용은 한 번만 보상한다(반려된 건은 다시 제보할 수 있게 열어둔다).
  CREATE UNIQUE INDEX idx_bounty_dedup ON bounty_claims(dedup_key) WHERE status IN ('pending', 'approved');
  CREATE INDEX idx_bounty_status ON bounty_claims(status, created_at);
  CREATE INDEX idx_bounty_user ON bounty_claims(user_id, created_at);

  CREATE TABLE redemptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    item_label TEXT NOT NULL,
    credits INTEGER NOT NULL,
    contact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    admin_note TEXT,
    created_at BIGINT NOT NULL,
    handled_at BIGINT
  );
  CREATE INDEX idx_redemption_status ON redemptions(status, created_at);
  CREATE INDEX idx_redemption_user ON redemptions(user_id, created_at);

  ALTER TABLE users ADD COLUMN referral_code TEXT;
  ALTER TABLE users ADD COLUMN referred_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
  CREATE UNIQUE INDEX idx_users_refcode ON users(referral_code);

  CREATE TABLE referrals (
    id BIGSERIAL PRIMARY KEY,
    referrer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    signup_ip TEXT,
    same_ip INTEGER NOT NULL DEFAULT 0,
    credited_at BIGINT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_referrals_referrer ON referrals(referrer_id, status);

  ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
  ALTER TABLE bounty_claims ENABLE ROW LEVEL SECURITY;
  ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
  `,

  // 공헌도 — 크레딧과 완전히 다른 물건이라 원장을 따로 둔다. 크레딧은 검증 횟수로
  // 바꿔 쓰는 재화라 잔액이 오르내리지만, 공헌도는 "이 사람이 유메에 얼마나 보탰나"를
  // 누적으로만 재는 점수라 차감되지 않고 랭킹의 근거가 된다. 한 원장에 섞으면
  // 검증 횟수를 쓸 때마다 순위가 내려가는 이상한 일이 생긴다.
  //
  // ref로 중복 지급을 막는다 — 같은 검증이 두 번 점수를 주면 안 된다. 부분 인덱스라
  // ref가 없는(수동 조정 같은) 기록은 여러 건 남을 수 있다.
  //
  // display_name은 랭킹 보드에 내보낼 이름이다. 이메일은 절대 보드에 올리지 않는다.
  `
  CREATE TABLE contribution_ledger (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    memo TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_contrib_user ON contribution_ledger(user_id, id);
  CREATE UNIQUE INDEX idx_contrib_dedup ON contribution_ledger(user_id, reason, ref) WHERE ref IS NOT NULL;

  ALTER TABLE users ADD COLUMN display_name TEXT;

  ALTER TABLE contribution_ledger ENABLE ROW LEVEL SECURITY;
  `,

  // 크레딧 원장에도 중복 방지 인덱스를 건다.
  //
  // 요금제 월 지급은 "이번 달 것이 이미 들어왔는지"를 ref(plan:요금제:YYYY-MM)로 판별해
  // ON CONFLICT DO NOTHING으로 막는데, 대상 인덱스가 없으면 충돌이 일어나지 않아
  // 화면을 열 때마다 지급이 반복된다. 구매 지급도 같은 이유로 ref를 쓴다.
  //
  // 인덱스를 만들기 전에 이미 중복으로 들어간 행을 정리한다 — 가장 먼저 들어온 한 건만 남긴다.
  `
  DELETE FROM credit_ledger a
   USING credit_ledger b
   WHERE a.ref IS NOT NULL
     AND a.user_id = b.user_id AND a.reason = b.reason AND a.ref = b.ref
     AND a.id > b.id;

  CREATE UNIQUE INDEX idx_credit_dedup ON credit_ledger(user_id, reason, ref) WHERE ref IS NOT NULL;
  `,

  // 닉네임과 분기.
  //
  // 닉네임은 랭킹에 나가는 유일한 이름이라 겹치면 안 된다. 대소문자만 다른 이름도
  // 같은 사람으로 오해되므로 소문자로 접어서 유니크를 건다. 이미 가입한 사람에게는
  // 계정 id로 만든 핸들을 먼저 채워 넣어야 인덱스를 걸 수 있다.
  //
  // period는 "2026-Q3" 형태다. 랭킹은 분기마다 초기화되는데, 기록을 지우는 게 아니라
  // 이번 분기 것만 세는 방식이다 — 지난 분기 수상 내역과 적립 경위가 남아야
  // 나중에 이의가 들어와도 확인할 수 있다.
  `
  UPDATE users SET display_name = '검증가' || (1000 + (id * 7919) % 9000) WHERE display_name IS NULL OR display_name = '';
  CREATE UNIQUE INDEX idx_users_display_name ON users(LOWER(display_name));

  ALTER TABLE contribution_ledger ADD COLUMN period TEXT;
  UPDATE contribution_ledger SET period = '2026-Q3' WHERE period IS NULL;
  CREATE INDEX idx_contrib_period ON contribution_ledger(period, user_id);

  CREATE TABLE quarter_awards (
    id BIGSERIAL PRIMARY KEY,
    period TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    points INTEGER NOT NULL,
    reward_kind TEXT NOT NULL,
    reward_label TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at BIGINT NOT NULL
  );
  CREATE UNIQUE INDEX idx_quarter_award ON quarter_awards(period, user_id);
  ALTER TABLE quarter_awards ENABLE ROW LEVEL SECURITY;
  `,

  // 주장 단위 캐시.
  //
  // 지금까지는 입력 전문이 글자 하나까지 같을 때만 재사용했다. 그런데 "민법 제750조는
  // 불법행위 책임을 규정한다" 같은 주장은 서로 다른 AI 답변에 계속 나온다 — 답변은
  // 다른데 검증할 내용은 같다. 주장 단위로 들고 있으면 자주 나오는 주장은 한 번만 판단하면 된다.
  //
  // 같은 판정이 나올 때만 재사용하는 것이므로 정확도는 그대로다. 다만 두 가지를 지킨다.
  //   · 확인되지 않음은 캐시하지 않는다. 다음번엔 찾을 수도 있는데 못 찾은 결과를
  //     붙들고 있으면 영영 확인되지 않는다.
  //   · 법률 주장은 하루 단위로만 재사용한다. 법령 개정은 시행일 0시에 적용되므로,
  //     날짜가 바뀌면 캐시가 통째로 무효가 된다 — 개정 전 조문으로 "맞다"고 하는 건
  //     유메가 잡으려는 실패(시점 붕괴) 그 자체다.
  `
  CREATE TABLE claim_cache (
    hash TEXT PRIMARY KEY,
    verdict TEXT NOT NULL,
    verified_via TEXT,
    explanation TEXT,
    sources_json TEXT,
    nec_json TEXT,
    effective_date TEXT,
    hits INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_claim_cache_created ON claim_cache(created_at);
  ALTER TABLE claim_cache ENABLE ROW LEVEL SECURITY;
  `,

  // 본인확인(통합인증) 동의 시각. CI는 본인확인기관이 주민등록번호를 일방향 암호화한 값이라
  // 동의를 받은 사실이 남아 있어야 한다. CI 값 자체는 저장하지 않는다.
  `
  ALTER TABLE users ADD COLUMN identity_agreed_at BIGINT;
  `,

  // 크레딧 결제 주문. 포트원 결제창을 띄우기 전에 여기 금액을 먼저 박아 두고, 결제가 끝나면
  // 서버가 포트원에 물어본 금액과 이 금액을 대조한다. 브라우저가 알려 준 금액은 쓰지 않는다.
  //
  // 본인확인은 CI를 그대로 저장하지 않고 해시만 둔다. 같은 사람이 계정을 여러 개 만들어
  // 무료분을 반복해 받는 것을 막는 용도로만 쓴다.
  `
  CREATE TABLE credit_orders (
    payment_id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_key TEXT NOT NULL,
    credits INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    method TEXT,
    paid_at BIGINT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_credit_orders_user ON credit_orders(user_id, created_at);
  ALTER TABLE credit_orders ENABLE ROW LEVEL SECURITY;

  ALTER TABLE users ADD COLUMN identity_verified_at BIGINT;
  ALTER TABLE users ADD COLUMN identity_ci_hash TEXT;
  ALTER TABLE users ADD COLUMN identity_name TEXT;
  CREATE INDEX idx_users_ci_hash ON users(identity_ci_hash);
  `,

  // 주문 하나로 크레딧 팩과 요금제(1개월 이용권)를 같이 다룬다. kind가 'plan'이면 결제가
  // 확인될 때 요금제를 열어 주고, 'credits'면 크레딧을 넣는다. 예전 주문은 전부 크레딧이다.
  `
  ALTER TABLE credit_orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'credits';
  ALTER TABLE credit_orders ADD COLUMN plan TEXT;
  `,

  // 본인확인에서 받은 휴대폰 번호. 처음에는 저장하지 않으려 했는데, 이니시스 V2 일반결제가
  // 구매자 휴대폰 번호를 필수로 요구해서 결제창이 열리지 않았다. 결제할 때마다 다시
  // 입력받는 것보다, 이미 본인확인으로 확인된 번호를 쓰는 편이 정확하고 손이 덜 간다.
  // 개인정보처리방침 수집 항목에도 같이 적었다.
  `
  ALTER TABLE users ADD COLUMN identity_phone TEXT;
  `,

  // 개발 외주 문의. 메일이 실패해도 문의가 사라지지 않게 먼저 여기 남긴다.
  `
  CREATE TABLE inquiries (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    company TEXT,
    kind TEXT,
    budget TEXT,
    message TEXT NOT NULL,
    ip TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_inquiries_created ON inquiries(created_at);
  ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
  `,

  // 할루시네이션 감사 — 발급한 문항과 채점 결과.
  //
  // 둘 다 서버 메모리의 Map에 있었다. 배포하거나 서버가 재시작되면 진행 중이던 감사가
  // 통째로 사라져서, 문항을 받아 자기 AI에 넣고 돌아온 사람이 "세션이 만료됐다"는 말을
  // 듣는다. 실제로 그 일이 일어났다. 7일짜리라고 안내한 결과 링크도 같이 끊겼다.
  // 이건 B2B 리드를 받으려고 만든 도구라, 한 번 끊기면 그 사람은 다시 오지 않는다.
  //
  // 문항의 정답(groundTruth·oracle)은 발급 응답에 절대 나가지 않지만 채점에는 필요하다.
  // 그래서 probes 전체를 여기 두고 채점할 때 다시 꺼낸다 — 메모리에 두던 이유와 같다.
  `
  CREATE TABLE audit_sessions (
    id TEXT PRIMARY KEY,
    probes TEXT NOT NULL,
    meta TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_audit_sessions_created ON audit_sessions(created_at);
  ALTER TABLE audit_sessions ENABLE ROW LEVEL SECURITY;

  CREATE TABLE audit_reports (
    id TEXT PRIMARY KEY,
    report TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_audit_reports_created ON audit_reports(created_at);
  ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
  `,

  // 스튜디오 운영 보드 — 외주 건과 자사 제품 진행 상황.
  //
  // 문의(inquiries)는 들어온 기록일 뿐이라 "지금 어디까지 왔나"를 담지 못한다.
  // 수주해서 만들고 돈을 받는 과정은 문의와 수명이 다르므로 별도 표로 둔다.
  // 문의에서 전환된 건은 inquiry_id로 이어 두어 어디서 온 일인지 남긴다.
  //
  // 금액은 두 개다. amount_krw는 계약한 금액, paid_krw는 실제로 받은 금액.
  // 매출을 계약 기준으로 세면 받지 못한 돈까지 매출로 잡히므로, 합계는 받은 쪽으로 낸다.
  `
  CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    client TEXT,
    contact TEXT,
    kind TEXT,
    status TEXT NOT NULL DEFAULT 'lead',
    amount_krw BIGINT NOT NULL DEFAULT 0,
    paid_krw BIGINT NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    started_at BIGINT,
    due_at BIGINT,
    done_at BIGINT,
    note TEXT,
    inquiry_id INTEGER,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_projects_status ON projects(status, updated_at);
  ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

  -- 자사 제품(유메·프로바·밸러스트·아이픽)의 할 일 체크리스트.
  -- 외주 건과 표를 합치지 않는 이유는, 이쪽은 고객도 금액도 마감도 없고
  -- "무엇이 남았나"만 필요해서다. 한 표에 억지로 넣으면 양쪽 다 빈 칸이 많아진다.
  CREATE TABLE product_tasks (
    id SERIAL PRIMARY KEY,
    product TEXT NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'todo',
    sort INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_product_tasks ON product_tasks(product, sort);
  ALTER TABLE product_tasks ENABLE ROW LEVEL SECURITY;
  `,

  // ── 의뢰 스레드 — 리머 사이트에서 문의·대화·견적·결제가 한 줄로 이어지도록 ──
  //
  // 의뢰인에게 계정을 만들게 하지 않는다. 개발 외주를 맡기려고 회원가입부터 하라고 하면
  // 대부분 거기서 그만둔다. 대신 문의 한 건마다 긴 무작위 토큰을 만들어 그 주소를
  // 아는 사람만 들어오게 한다 — 토큰이 곧 열쇠다.
  //
  // 토큰 원문은 저장하지 않고 해시만 남긴다. 세션·API 키와 같은 규칙이다. DB가 통째로
  // 새어도 남의 대화를 열 수는 없어야 한다.
  `
  CREATE TABLE threads (
    id SERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    -- 토큰을 되돌려 읽을 수 있는 유일한 자리. 알림 메일에 "이어서 보기" 링크를 넣으려면
    -- 토큰이 필요한데, 해시만 두면 만들 방법이 없다. 서버 비밀값으로 봉해 두어
    -- DB만 새는 경우와 DB와 환경변수가 함께 새는 경우를 갈라 놓는다(threads.js 참고).
    link_enc TEXT,
    inquiry_id INTEGER,
    project_id INTEGER,
    client_name TEXT,
    client_contact TEXT,
    client_email TEXT,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    client_read_at BIGINT NOT NULL DEFAULT 0,
    admin_read_at BIGINT NOT NULL DEFAULT 0,
    last_message_at BIGINT,
    last_sender TEXT,
    notified_at BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_threads_updated ON threads(updated_at DESC);
  CREATE INDEX idx_threads_email ON threads(client_email);
  ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

  -- 주고받은 말. sender는 client(의뢰인) / reamer(우리) / system(기록).
  -- system은 사람이 쓴 말이 아니라 "견적을 보냈다", "결제됐다" 같은 사건이다.
  -- 같은 표에 두는 이유는, 대화를 읽을 때 그 사건들이 시간 순서대로 섞여 있어야
  -- 무슨 일이 있었는지가 한 번에 보이기 때문이다.
  CREATE TABLE thread_messages (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL,
    quote_id INTEGER,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_thread_messages ON thread_messages(thread_id, id);
  ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

  -- 결제 요청(견적). 금액은 여기가 유일한 기준이다 — 브라우저가 보내온 금액으로
  -- 결제를 승인하면 얼마든지 깎을 수 있다. 결제 확인은 이 표의 amount_krw와
  -- 포트원이 알려 준 실제 결제 금액이 같을 때만 통과시킨다.
  CREATE TABLE thread_quotes (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    amount_krw BIGINT NOT NULL,
    weeks TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    payment_id TEXT UNIQUE,
    method TEXT,
    payer_name TEXT,
    payer_email TEXT,
    paid_at BIGINT,
    expires_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_thread_quotes ON thread_quotes(thread_id, id);
  ALTER TABLE thread_quotes ENABLE ROW LEVEL SECURITY;
  `,

  // ── 진행 상황 공유 ──
  //
  // 결제까지 끝나면 의뢰인이 가장 궁금한 것은 "지금 어디까지 됐나"인데, 지금은 물어봐야
  // 알 수 있다. 그 답을 대화방에서 바로 보이게 한다.
  //
  // 표를 새로 만들지 않고 이미 있는 체크리스트(product_tasks)를 그대로 쓴다. 대시보드에서
  // 관리하던 그 목록이 곧 진행 상황이라, 두 벌로 나누면 반드시 한쪽만 갱신하게 된다.
  // 다만 전부를 보여 줄 수는 없다 — 내부용 메모가 섞이기 때문에, 항목마다 공개 여부를 둔다.
  // 기본값은 비공개다. 기존 항목이 이 배포와 함께 갑자기 의뢰인에게 보이면 안 된다.
  `
  ALTER TABLE product_tasks ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE;

  -- 돌아가는 화면을 볼 수 있는 주소. "매주 진행 공유"라는 약속을 지키는 가장 짧은 방법이다.
  ALTER TABLE projects ADD COLUMN preview_url TEXT;
  `,

  // ── 검증 한 건의 원가를 남긴다 ──
  //
  // apiCost.js는 호출마다 토큰과 검색 횟수를 이미 세고 있었다. 그런데 그 결과가
  // console.log로만 나갔다. 로그는 보존 기간이 짧고 질의할 수 없어서, "검증 1건 210원"이
  // 어디서 나온 숫자인지도, 지금도 210원인지도 확인할 방법이 없었다.
  //
  // 원가를 깎는 것이 이 서비스에서 가장 레버리지가 큰 일인데(손익분기 전환율이 건당
  // 210원에서 7.2%, 105원이면 2.6%다) 깎으려면 먼저 보여야 한다.
  //
  // 검색 횟수를 총액과 따로 두는 이유는 그게 가장 비싼 항목이면서 줄일 수 있는
  // 항목이기 때문이다 — 건당 과금인 데다 결과가 대화에 쌓여 다음 턴의 입력 토큰까지
  // 부풀린다. 무엇을 줄일지는 총액이 아니라 이 칸이 말해 준다.
  `
  ALTER TABLE verifications ADD COLUMN cost_usd DOUBLE PRECISION;
  ALTER TABLE verifications ADD COLUMN api_calls INTEGER;
  ALTER TABLE verifications ADD COLUMN searches INTEGER;
  ALTER TABLE verifications ADD COLUMN reused_claims INTEGER;
  CREATE INDEX idx_verifications_cost ON verifications(created_at) WHERE cost_usd IS NOT NULL;
  `,

  // ── 전체 채팅(로비) ──
  //
  // 순위를 혼자 보는 것과 남들이 보는 자리에서 보는 것은 전혀 다른 물건이다.
  // 공헌도는 이미 있었지만 랭킹 화면을 따로 열어야 보였다. 말이 오가는 자리 옆에
  // 등수가 붙어 있으면 그 숫자가 비로소 움직인다.
  //
  // 메시지를 지우지 않고 hidden으로 내리는 이유는, 신고가 들어와 내린 글도
  // 나중에 왜 내렸는지 확인할 수 있어야 하기 때문이다.
  `
  CREATE TABLE lobby_messages (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_by BIGINT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_lobby_recent ON lobby_messages(id DESC);
  ALTER TABLE lobby_messages ENABLE ROW LEVEL SECURITY;
  `,

  // ── 검증이 아닌 API 호출의 원가 ──
  //
  // verifications에 붙인 cost_usd는 검증 한 건의 원가다. 그런데 캡처 읽기처럼
  // 검증 행이 생기기 전에 돈이 나가는 호출이 있다. 그걸 로그로만 두면, 원가를
  // 깎으려고 만든 장부에 정작 새로 늘어난 항목이 빠진다.
  `
  CREATE TABLE api_costs (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    user_id BIGINT,
    cost_usd DOUBLE PRECISION NOT NULL,
    calls INTEGER,
    searches INTEGER,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_api_costs ON api_costs(kind, created_at);
  ALTER TABLE api_costs ENABLE ROW LEVEL SECURITY;
  `,

  // ── 판정 정정 ──
  //
  // 유메가 틀렸을 때 사용자가 할 수 있는 일이 없었다. 화면에는 "사실과 다름"이 붙어
  // 있는데 본인은 그게 아니라는 걸 알고, 근거도 손에 쥐고 있는데 그걸 넘길 문이
  // 없었다. 우리는 그 사실을 영영 모르고, 같은 판정을 다음 사람에게도 내보낸다.
  //
  // 제보(bounty_claims)와는 다른 물건이다. 제보는 **남의 AI가** 지어낸 것을 넘겨주는
  // 것이고, 이건 **우리가** 틀린 것을 알려주는 것이다. 공유 링크도 필요 없다 —
  // 대상이 이미 우리 검증 기록 안에 있다.
  //
  // 보상을 거는 이유. 자기 시간을 써서 남의 오류를 고쳐 주는 사람은 드물고, 팩트체크
  // 서비스가 스스로 오류를 발견할 방법은 사실상 이것뿐이다. 우리가 틀린 것을
  // 알려주는 값이 남의 AI가 틀린 것을 알려주는 값보다 낮을 이유가 없다.
  //
  // 승인 시 그 주장의 캐시를 지운다(corrections.js). 판정만 고치고 캐시를 두면 같은
  // 주장이 다음 검증에서 그 틀린 판정으로 다시 나간다.
  `
  CREATE TABLE verdict_corrections (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verification_id TEXT REFERENCES verifications(id) ON DELETE SET NULL,
    claim_idx INTEGER NOT NULL,
    claim_text TEXT NOT NULL,
    claim_hash TEXT,
    yume_verdict TEXT NOT NULL,
    yume_explanation TEXT,
    correct_verdict TEXT NOT NULL,
    evidence_url TEXT,
    note TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    points INTEGER NOT NULL DEFAULT 0,
    reviewer_note TEXT,
    reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at BIGINT,
    created_at BIGINT NOT NULL
  );
  -- 같은 사람이 같은 주장을 두 번 넣어 점수를 두 번 받을 수는 없다(반려된 건은 다시 열어둔다).
  CREATE UNIQUE INDEX idx_correction_dedup ON verdict_corrections(user_id, verification_id, claim_idx)
    WHERE status IN ('pending', 'accepted');
  CREATE INDEX idx_correction_status ON verdict_corrections(status, created_at);
  CREATE INDEX idx_correction_user ON verdict_corrections(user_id, id);
  ALTER TABLE verdict_corrections ENABLE ROW LEVEL SECURITY;
  `,

  // 쿠팡파트너스 상품 검색 결과. 검색 API는 1시간 10회뿐이고 넘기면 24시간 막히므로,
  // 같은 키워드는 하루 동안 여기서 꺼내 쓴다(server/coupang.js). 결과가 없던 키워드도 담는다.
  `
  CREATE TABLE coupang_products (
    keyword TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    fetched_at BIGINT NOT NULL
  );
  ALTER TABLE coupang_products ENABLE ROW LEVEL SECURITY;
  `,

  // 의뢰 대화의 사진(server/threadFiles.js). 서버에 디스크가 없어 재배포하면 파일이 사라지므로
  // DB에 담는다. 브라우저가 줄여서 보내 한 장이 보통 수백 KB다.
  `
  CREATE TABLE thread_files (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_thread_files_msg ON thread_files(message_id);
  ALTER TABLE thread_files ENABLE ROW LEVEL SECURITY;
  `,

  // 유입 측정(server/events.js). 사람을 식별하지 않는다 — 무작위 브라우저 id와 첫 유입 출처뿐.
  `
  CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    anon TEXT,
    user_id BIGINT,
    source TEXT,
    medium TEXT,
    campaign TEXT,
    amount INTEGER,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_events_day ON events(kind, day);
  CREATE INDEX idx_events_user ON events(user_id) WHERE user_id IS NOT NULL;
  ALTER TABLE events ENABLE ROW LEVEL SECURITY;
  `,

  // ── 같은 요청을 두 번 받아도 한 번만 처리한다(API 멱등 키) ──
  //
  // 고객사 서버는 응답을 못 받으면 다시 보낸다(시간 초과, 네트워크 끊김). 그때마다 새 검증을
  // 시작하면 같은 글을 두 번 과금한다. Idempotency-Key 헤더가 같으면 처음 시작한 검증을
  // 그대로 돌려준다. 본문이 다른데 키가 같으면 실수이므로 거절한다(body_hash).
  // 하루가 지나면 지운다 — 재시도는 그 안에 끝난다.
  `
  CREATE TABLE api_idempotency (
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    idem_key TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    kind TEXT NOT NULL,
    refs_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (api_key_id, idem_key)
  );
  CREATE INDEX idx_api_idem_created ON api_idempotency(created_at);
  ALTER TABLE api_idempotency ENABLE ROW LEVEL SECURITY;
  `,

  // ── 긴 문서 검사(documents.js) ──
  //
  // 문서 하나가 조각 여러 개(검증 행 여러 개)로 나뉜다. 원문 전체를 여기 둬야 조각 결과를
  // 원문 위치로 다시 합치고, 고친 문장을 반영한 "고친 본문"을 만들 수 있다.
  // 보존 기간은 API 검증과 같다(1년, maintenance).
  `
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    title TEXT,
    input TEXT NOT NULL,
    chunks_json TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_documents_key ON documents(api_key_id, created_at);
  CREATE INDEX idx_documents_user ON documents(user_id, created_at);
  ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
  `,

  // 근거 잠금(evidenceLock.js)의 확신도. 캐시에서 다시 쓸 때도 처음 확인한 수준을 그대로 알려야
  // 엄격 모드가 캐시 적중분을 일괄로 '확인 못 함'으로 내리지 않는다.
  `
  ALTER TABLE claim_cache ADD COLUMN confidence TEXT;
  `,

  // YUME 검증 마크(trustMarks.js). 공개 검증 페이지(/v/:id)에 원문과 주장별 근거를 싣는다.
  // 원문은 발급자가 공개에 동의한 것이므로 문서 보관 기간(1년)과 따로 둔다. 계정을 지우면 함께 지운다.
  `
  CREATE TABLE trust_marks (
    id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT,
    title TEXT,
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    claims_json TEXT NOT NULL,
    first_issued_at BIGINT NOT NULL,
    issued_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    renewals INTEGER NOT NULL DEFAULT 0,
    revoked_at BIGINT,
    revoked_reason TEXT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_trust_marks_user ON trust_marks(user_id, created_at);
  CREATE INDEX idx_trust_marks_hash ON trust_marks(user_id, text_hash);
  ALTER TABLE trust_marks ENABLE ROW LEVEL SECURITY;
  `,

  // ── 감사 데스크(auditDesk.js) — 특정 회사 AI 서비스를 표본 감사하고 비공개로 알리는 영업 도구 ──
  //
  // 한 건(ai_audits)이 영업 한 줄이다. 약관 확인 → 질문·답변 기록 → 유메 검사 → 사람이 원문 재확인
  // → 비공개 보고서 → 메일 → 후속 → 결과까지 같은 행에 시각으로 남는다. 숫자(발송→답장→미팅→
  // 무료 검사→유료 의향)는 여기서 센다. 회사명은 동의(consent_name)가 있을 때만 밖으로 나간다.
  //
  // 문항(ai_audit_items)은 정답을 서버에만 둔다(probe_json) — 무료 점검과 같은 이유다.
  // 답변은 운영자가 일반 사용자로서 손으로 넣은 것이고, answered_at이 캡처 시각이다.
  // 재확인 항목(ai_audit_findings)은 유메가 지목한 오류 후보다. 사람이 원문을 직접 열어
  // confirmed로 바꾼 것만 보고서·지수에 "불일치"로 들어간다.
  `
  CREATE TABLE ai_audits (
    id BIGSERIAL PRIMARY KEY,
    company TEXT NOT NULL,
    service_name TEXT NOT NULL DEFAULT '',
    service_url TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '법률',
    category TEXT NOT NULL DEFAULT 'service',
    stage TEXT NOT NULL DEFAULT 'prospect',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_role TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    found_via TEXT NOT NULL DEFAULT '',
    tos_url TEXT NOT NULL DEFAULT '',
    tos_verdict TEXT,
    tos_note TEXT NOT NULL DEFAULT '',
    tos_checked_at BIGINT,
    highlights TEXT NOT NULL DEFAULT '',
    checklist_json TEXT NOT NULL DEFAULT '{}',
    mail_subject TEXT,
    mail_body TEXT,
    report_token TEXT UNIQUE,
    report_shared_at BIGINT,
    sent_at BIGINT,
    followup_due_at BIGINT,
    followed_up_at BIGINT,
    replied_at BIGINT,
    meeting_at BIGINT,
    full_audit_at BIGINT,
    paid_intent_at BIGINT,
    closed_at BIGINT,
    outcome TEXT,
    paid_amount_krw BIGINT,
    decline_reason TEXT NOT NULL DEFAULT '',
    price_heard TEXT NOT NULL DEFAULT '',
    needs TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    minutes_spent INTEGER NOT NULL DEFAULT 0,
    consent_name INTEGER NOT NULL DEFAULT 0,
    consent_note TEXT NOT NULL DEFAULT '',
    consent_at BIGINT,
    public_id TEXT UNIQUE,
    public_at BIGINT,
    index_excluded INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_ai_audits_stage ON ai_audits(stage, updated_at);
  ALTER TABLE ai_audits ENABLE ROW LEVEL SECURITY;

  CREATE TABLE ai_audit_items (
    id BIGSERIAL PRIMARY KEY,
    audit_id BIGINT NOT NULL REFERENCES ai_audits(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL,
    qtype TEXT NOT NULL DEFAULT '',
    question TEXT NOT NULL,
    probe_json TEXT,
    answer TEXT,
    answered_at BIGINT,
    status TEXT NOT NULL DEFAULT 'new',
    check_started_at BIGINT,
    grade_json TEXT,
    verification_id TEXT,
    verify_json TEXT,
    error TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_ai_audit_items_audit ON ai_audit_items(audit_id, position);
  ALTER TABLE ai_audit_items ENABLE ROW LEVEL SECURITY;

  CREATE TABLE ai_audit_findings (
    id BIGSERIAL PRIMARY KEY,
    audit_id BIGINT NOT NULL REFERENCES ai_audits(id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL REFERENCES ai_audit_items(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    claim_index INTEGER,
    polarity TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT '',
    claim TEXT NOT NULL DEFAULT '',
    ai_quote TEXT NOT NULL DEFAULT '',
    yume_reason TEXT NOT NULL DEFAULT '',
    truth TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    source_label TEXT NOT NULL DEFAULT '',
    nec_score DOUBLE PRECISION,
    review TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '',
    checked_url TEXT NOT NULL DEFAULT '',
    reviewed_at BIGINT,
    featured INTEGER NOT NULL DEFAULT 0,
    in_index INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_ai_audit_findings_audit ON ai_audit_findings(audit_id, item_id);
  ALTER TABLE ai_audit_findings ENABLE ROW LEVEL SECURITY;

  CREATE TABLE ai_audit_files (
    id BIGSERIAL PRIMARY KEY,
    audit_id BIGINT NOT NULL REFERENCES ai_audits(id) ON DELETE CASCADE,
    item_id BIGINT NOT NULL REFERENCES ai_audit_items(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_ai_audit_files_item ON ai_audit_files(item_id);
  ALTER TABLE ai_audit_files ENABLE ROW LEVEL SECURITY;
  `,

  // ── 공개 지표 — YUME 할루시네이션 지수(hallucinationIndex.js) ──
  //
  // audit_outcomes: 무료 자가 점검의 문항별 결과만 익명으로 남긴다. 회사명·답변 원문·IP는 넣지 않는다
  // (리포트 자체는 7일 뒤 지워지지만, 지수는 기간을 거슬러 세어야 한다).
  // index_issues: 발행한 지수 한 호. 발행하면 data_json을 얼리고 SHA-256 지문을 붙인다. 고칠 때는
  // 조용히 덮어쓰지 않고 revision을 올리고 정정 기록(corrections_json)에 이전 지문을 남긴다.
  `
  CREATE TABLE audit_outcomes (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT NOT NULL,
    probe_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_audit_outcomes_created ON audit_outcomes(created_at);
  ALTER TABLE audit_outcomes ENABLE ROW LEVEL SECURITY;

  CREATE TABLE index_issues (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    period_start BIGINT NOT NULL,
    period_end BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    data_json TEXT NOT NULL,
    commentary TEXT NOT NULL DEFAULT '',
    method_version TEXT NOT NULL,
    sha256 TEXT,
    published_at BIGINT,
    revision INTEGER NOT NULL DEFAULT 0,
    corrections_json TEXT NOT NULL DEFAULT '[]',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  ALTER TABLE index_issues ENABLE ROW LEVEL SECURITY;
  `,
  // 감사 한 건에 실제로 든 시간 — 손으로 적는 minutes_spent는 비기 쉽다. 데스크에서 무언가를 할 때마다
  // 직전 활동과 10분 안쪽이면 그 간격을 더한다(자리를 비운 시간은 세지 않는다). auditDesk.touchWork.
  `
  ALTER TABLE ai_audits ADD COLUMN work_ms BIGINT NOT NULL DEFAULT 0;
  ALTER TABLE ai_audits ADD COLUMN last_active_at BIGINT;
  `,
  // 질문을 어떻게 보냈는가 — 'manual'(일반 사용자로서 화면에 직접 입력, 기본) | 'api'(대상이 공개한 공식 API).
  // 보고서·메일의 "검사 방법" 문장이 실제와 같아야 한다. API로 공개된 모델(Claude·GPT API 등)을 감사할 때 api.
  `
  ALTER TABLE ai_audits ADD COLUMN input_method TEXT NOT NULL DEFAULT 'manual';
  `,
  // 보고서에 실리는 사례 한 줄 제목. 검토자가 원문을 확인하며 쓴다(비우면 자동 제목). 상대 담당자가 사례를
  // 한 줄로 이해하게 하는 자리라, 채점 메모(review_note)와 따로 둔다 — 메모는 내부용이다.
  `
  ALTER TABLE ai_audit_findings ADD COLUMN report_title TEXT;
  `,
  // 기업 견적·계약 신청(b2bDeals.js). 금액은 서버가 정한 값만 들어간다. billing_json은 세금계산서 발급
  // 정보(사업자등록번호·상호·대표자·이메일…) — 홈택스에 옮겨 적는 값이라 그대로 둔다. audit_id는 감사
  // 보고서에서 이어진 견적이면 그 감사 건.
  `
  CREATE TABLE b2b_quotes (
    id BIGSERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    product TEXT NOT NULL,
    items_json TEXT NOT NULL,
    supply_krw BIGINT NOT NULL,
    vat_krw BIGINT NOT NULL,
    total_krw BIGINT NOT NULL,
    company TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    note TEXT,
    source TEXT NOT NULL DEFAULT 'self',
    audit_id BIGINT REFERENCES ai_audits(id) ON DELETE SET NULL,
    valid_until BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'issued',
    billing_json TEXT,
    pay_method TEXT,
    terms_version TEXT,
    agreed_at BIGINT,
    requested_at BIGINT,
    request_ip TEXT,
    paid_at BIGINT,
    ip TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX idx_b2b_quotes_audit ON b2b_quotes(audit_id);
  ALTER TABLE b2b_quotes ENABLE ROW LEVEL SECURITY;
  `,
  // 리머 견적의 계좌이체 신청(카드 PG 계약 전에도 받을 수 있게). transfer_json은 증빙 정보 —
  // 세금계산서(사업자번호·상호·대표자·이메일) 또는 현금영수증(휴대폰·사업자번호) — 홈택스에 옮겨 적는 값.
  `
  ALTER TABLE thread_quotes ADD COLUMN transfer_json TEXT;
  ALTER TABLE thread_quotes ADD COLUMN transfer_requested_at BIGINT;
  `,
  // 2026-10-14 가격 개편: API는 1,000자마다 1건(units). 감사 주문(order_json: 감사할 서비스·업종·접근 방법),
  // 작업 마감(due_at = 입금 확인 + 영업일 3일), 보고서 전달(delivered_at)과 정기 감사 회차(rounds_done).
  `
  ALTER TABLE api_usage ADD COLUMN units INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE b2b_quotes ADD COLUMN order_json TEXT;
  ALTER TABLE b2b_quotes ADD COLUMN due_at BIGINT;
  ALTER TABLE b2b_quotes ADD COLUMN delivered_at BIGINT;
  ALTER TABLE b2b_quotes ADD COLUMN rounds_done INTEGER NOT NULL DEFAULT 0;
  `,
  // 2026-10-14 AI 직원(server/staff/). 직원마다 근무 상태·모드, 업무 일지, 결재함.
  // 결재함 dedupe는 같은 일을 두 번 올리지 않게 하는 열쇠다(예: "send:audit:12") — 반려해도 남겨 둔다.
  `
  CREATE TABLE staff_state (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    autonomy TEXT NOT NULL DEFAULT 'approve',
    daily_cap INTEGER,
    last_run_at BIGINT,
    last_status TEXT,
    last_note TEXT,
    updated_at BIGINT NOT NULL
  );
  CREATE TABLE staff_log (
    id BIGSERIAL PRIMARY KEY,
    staff TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    ref TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_staff_log_time ON staff_log(created_at);
  CREATE INDEX idx_staff_log_staff ON staff_log(staff, created_at);
  CREATE TABLE staff_approvals (
    id BIGSERIAL PRIMARY KEY,
    staff TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    ref TEXT,
    dedupe TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    result TEXT,
    created_at BIGINT NOT NULL,
    decided_at BIGINT
  );
  CREATE INDEX idx_staff_approvals_status ON staff_approvals(status, created_at);
  ALTER TABLE b2b_quotes ADD COLUMN reminded_at BIGINT;
  ALTER TABLE b2b_quotes ADD COLUMN pay_reminded_at BIGINT;
  ALTER TABLE staff_state ENABLE ROW LEVEL SECURITY;
  ALTER TABLE staff_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE staff_approvals ENABLE ROW LEVEL SECURITY;
  `,
  // 2026-10-14 대표 메일함 정리(비서실 서윤). 한 번 본 메일은 다시 분류하지 않는다(message_id).
  `
  CREATE TABLE mail_inbox (
    id BIGSERIAL PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    uid BIGINT,
    from_addr TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    received_at BIGINT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    needs_reply INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    ref TEXT,
    approval_id BIGINT,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX idx_mail_inbox_time ON mail_inbox(received_at);
  ALTER TABLE mail_inbox ENABLE ROW LEVEL SECURITY;
  `,
  // 2026-10-14 답 수집 — 약관에 자동 접속 금지가 없으면 대표 PC의 현장 요원(scripts/field-agent.mjs)이 넣는다(collect_mode 'agent'),
  // 금지면 사람이 넣는다('manual'). collect_status: queued → running → done | login_required | failed.
  `
  ALTER TABLE ai_audits ADD COLUMN collect_mode TEXT;
  ALTER TABLE ai_audits ADD COLUMN collect_status TEXT;
  ALTER TABLE ai_audits ADD COLUMN collect_note TEXT;
  ALTER TABLE ai_audits ADD COLUMN collect_at BIGINT;
  `,
  // 약관 페이지를 서버가 못 읽으면(스크립트로 그리는 사이트) 대표 PC의 현장 요원이 진짜 브라우저로 열어 글을 가져온다.
  // tos_render: queued → done | failed, tos_text: 그 글.
  `
  ALTER TABLE ai_audits ADD COLUMN tos_render TEXT;
  ALTER TABLE ai_audits ADD COLUMN tos_text TEXT;
  `,
  // 질문 검수(현장 요원) — 답 수집 전에 기준 AI로 질문을 시험해, 기준 AI도 맞히는 쉬운 문항을 어려운 것으로 바꾼다.
  `
  ALTER TABLE ai_audits ADD COLUMN qcheck_at BIGINT;
  ALTER TABLE ai_audits ADD COLUMN qcheck_note TEXT;
  `,
  // 대표 할 일(투두) — 비서실이 그날 할 일을 결재함에 "오늘 할 일"로 올린다. check가 있으면 서버가 완료를 직접 확인한다.
  `
  CREATE TABLE owner_todos (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    after_key TEXT,
    check_key TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    snooze_until TEXT,
    created_at BIGINT NOT NULL,
    done_at BIGINT
  );
  ALTER TABLE owner_todos ENABLE ROW LEVEL SECURITY;
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
