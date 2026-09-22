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
  "threads", "thread_messages", "thread_quotes", "lobby_messages", "api_costs",
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
