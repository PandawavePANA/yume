// 베리라인 검증 API의 OpenAPI 3.1 명세 — GET /v1/openapi.json.
//
// 기업 개발팀은 문서를 읽기 전에 명세부터 코드 생성기·Postman에 넣는다. 명세가 없으면
// "붙여 보기" 단계에서 손으로 타입을 옮겨 적다가 필드 하나를 빠뜨리고, 그게 첫 문의가 된다.
// apiV1.js의 publicClaim·publicVerification이 실제로 내보내는 필드와 같아야 한다 —
// 필드를 추가·삭제하면 여기도 고친다(server/tests/openapi.test.js가 경로 목록을 대조한다).
import { MAX_REFERENCES, MAX_REFERENCE_CHARS } from "./referenceCheck.js";

import { siteOrigin } from "./site.js";
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, description = "") => ({ description, content: { "application/json": { schema } } });
const errors = (...codes) =>
  Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));

const verifyBody = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", maxLength: 10000, description: "검증할 텍스트. AI가 쓴 글이든 사람이 쓴 글이든 같습니다." },
    references: {
      type: "array", maxItems: MAX_REFERENCES,
      description: `자사 기준 자료(최대 ${MAX_REFERENCES}개, 합계 ${MAX_REFERENCE_CHARS.toLocaleString()}자). 이 자료가 다루는 주장은 웹보다 먼저 이 자료와 대조합니다. 저장하지 않습니다.`,
      items: ref("Reference"),
    },
    organization: { type: "string", description: "자사명. 자사에 관한 주장은 '공개 기록이 없다'는 이유만으로 false가 되지 않습니다." },
    strict: { type: "boolean", description: "엄격 모드 — confidence: high인 판정만 내리고 나머지는 uncertain." },
    wait: {
      oneOf: [{ type: "boolean" }, { type: "integer", minimum: 0, maximum: 120 }],
      description: "true면 최대 120초, 숫자면 그 초만큼 결과를 기다립니다. 시간 안에 끝나지 않으면 202와 id를 돌려줍니다.",
    },
    callback_url: { type: "string", format: "uri", description: "끝나면(실패 포함) 결과를 이 https 공인 주소로 POST합니다." },
    callback_secret: { type: "string", description: "주면 웹훅에 X-Yume-Signature로 서명합니다. 저장하지 않습니다." },
  },
};

export function openApiSpec(base = siteOrigin()) {
  return {
    openapi: "3.1.0",
    info: {
      title: "VERILINE Hallucination Check API",
      version: "1.0.0",
      description:
        "글 속 사실 주장을 하나씩 떼어 법령 원문·공식 레지스트리·출처 원문과 대조합니다. " +
        "사람이 읽는 설명서는 /docs/api 에 있습니다.",
      contact: { name: "리머(REAMER)", email: "reamer@d-reamer.com", url: `${base}/docs/api` },
    },
    servers: [{ url: base }],
    security: [{ bearer: [] }],
    paths: {
      "/v1/verify": {
        post: {
          operationId: "verify",
          summary: "텍스트 하나 검증",
          description: "보통 30~90초 걸립니다. wait 없이 보내면 바로 202와 id를 돌려주므로 GET /v1/verify/{id}로 조회하거나 callback_url을 쓰세요.",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          requestBody: { required: true, content: { "application/json": { schema: verifyBody } } },
          responses: {
            200: json(ref("Verification"), "검증 완료(또는 캐시 재사용)"),
            202: json(ref("Verification"), "진행 중 — status: pending"),
            ...errors(400, 401, 409, 413, 422, 429),
          },
        },
      },
      "/v1/verify/{id}": {
        get: {
          operationId: "getVerification",
          summary: "검증 결과 조회(과금 없음)",
          parameters: [{ $ref: "#/components/parameters/Id" }],
          responses: { 200: json(ref("Verification")), ...errors(401, 404) },
        },
      },
      "/v1/verify/batch": {
        post: {
          operationId: "verifyBatch",
          summary: "여러 건을 한 번에(최대 20건)",
          description: "남은 한도가 항목 수보다 적으면 한 건도 시작하지 않고 429를 돌려줍니다.",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items"],
                  properties: {
                    items: {
                      type: "array", minItems: 1, maxItems: 20,
                      items: { type: "object", required: ["text"], properties: { ref: { type: "string" }, text: { type: "string", maxLength: 10000 } } },
                    },
                    references: verifyBody.properties.references,
                    organization: verifyBody.properties.organization,
                    strict: verifyBody.properties.strict,
                    wait: verifyBody.properties.wait,
                    callback_url: verifyBody.properties.callback_url,
                    callback_secret: verifyBody.properties.callback_secret,
                  },
                },
              },
            },
          },
          responses: {
            200: json(ref("Batch")),
            202: json(ref("Batch"), "일부 진행 중"),
            ...errors(400, 401, 409, 422, 429),
          },
        },
      },
      "/v1/documents": {
        post: {
          operationId: "createDocument",
          summary: "긴 문서·파일 검사",
          description: "약 7,000자 조각 1개가 검증 1건으로 과금됩니다. DOCX·HWPX·PDF·TXT·MD·CSV, 10MB까지. 옛 HWP는 HWPX로 저장해 보내세요.",
          parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string", maxLength: 100000 },
                    file: { type: "object", required: ["name", "content_base64"], properties: { name: { type: "string" }, content_base64: { type: "string", contentEncoding: "base64" } } },
                    title: { type: "string" },
                    references: verifyBody.properties.references,
                    organization: verifyBody.properties.organization,
                    callback_url: verifyBody.properties.callback_url,
                    callback_secret: verifyBody.properties.callback_secret,
                    wait: verifyBody.properties.wait,
                  },
                  description: "text와 file 중 하나는 있어야 합니다.",
                },
              },
            },
          },
          responses: { 200: json(ref("Document")), 202: json(ref("Document")), ...errors(400, 401, 413, 422, 429) },
        },
      },
      "/v1/documents/{id}": {
        get: {
          operationId: "getDocument",
          summary: "문서 검사 결과 조회",
          parameters: [{ $ref: "#/components/parameters/Id" }],
          responses: { 200: json(ref("Document")), ...errors(401, 404) },
        },
      },
      "/v1/documents/{id}/mark": {
        post: {
          operationId: "issueMark",
          summary: "VERILINE 검증 마크 발급",
          description: "모든 주장이 confirmed이고 confidence: high인 문서만 발급합니다. 같은 글로 다시 받으면 같은 주소의 마크를 갱신합니다(200, renewed: true).",
          parameters: [{ $ref: "#/components/parameters/Id" }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["publish"], properties: { publish: { const: true, description: "글과 근거가 공개 검증 페이지에 게시되는 데 동의" } } } } },
          },
          responses: {
            200: json(ref("Mark"), "같은 글의 마크를 갱신"),
            201: json(ref("Mark"), "새로 발급"),
            ...errors(400, 401, 404),
            422: json(ref("Error"), "not_eligible — error.blockers에 주장별 이유"),
          },
        },
      },
      "/v1/marks/{id}": {
        get: { operationId: "getMark", summary: "검증 마크 상태", parameters: [{ $ref: "#/components/parameters/Id" }], responses: { 200: json(ref("Mark")), ...errors(401, 404) } },
      },
      "/v1/marks/{id}/revoke": {
        post: {
          operationId: "revokeMark",
          summary: "검증 마크 철회",
          parameters: [{ $ref: "#/components/parameters/Id" }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } },
          responses: { 200: json(ref("Mark")), ...errors(401, 404) },
        },
      },
      "/v1/context": {
        post: {
          operationId: "context",
          summary: "답 쓰기 전 근거 — 질문에 관련된 현행 조문(과금 없음)",
          description: "대화형 AI가 답을 쓰기 전에 부릅니다. 법령 이야기가 든 질문이면 법제처 현행 조문을 모아 block(시스템 안내에 그대로 넣을 글)으로 돌려줍니다. 법령 이야기가 아니면 legal: false.",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string", maxLength: 4000 } } } } } },
          responses: {
            200: json({
              type: "object",
              properties: {
                legal: { type: "boolean" },
                laws: { type: "array", items: { type: "object" } },
                articles: { type: "array", items: { type: "object", properties: { law: { type: "string" }, label: { type: "string" }, title: { type: "string" }, url: { type: "string" }, deleted: { type: "boolean" } } } },
                block: { type: "string" },
              },
            }),
            ...errors(400, 401),
          },
        },
      },
      "/v1/feedback": {
        post: {
          operationId: "feedback",
          summary: "놓친 오류 알리기 — 사용자가 신고했고 확인된 오류",
          description: "베리라인이 확인했다고 본 답에서 사용자가 틀린 곳을 찾았고, 운영자가 맞다고 본 경우 보냅니다. 베리라인이 다시 확인해 배웁니다(사실 문장만, 개인정보로 보이면 남기지 않음). 과금하지 않습니다.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["quote"], properties: {
              quote: { type: "string", maxLength: 400, description: "틀린 문장" },
              correct: { type: "string", maxLength: 400, description: "바른 내용(알면)" },
              url: { type: "string", description: "근거 주소(알면)" },
              note: { type: "string", maxLength: 400 },
              field: { type: "string", description: "분야(law · medical · tax … 모르면 general)" },
            } } } },
          },
          responses: { 200: { description: "받음", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, skipped: { type: "boolean" }, reason: { type: "string" } } } } } }, ...errors(400, 401) },
        },
      },
      "/v1/answer-check": {
        post: {
          operationId: "answerCheck",
          summary: "답변 확인 — 확인을 거친 답을 돌려받기",
          description:
            "AI가 쓴 답을 사용자에게 내보내기 전에 보냅니다. 법령은 현행 조문 전체와 대조하고 반론 검토를 통과한 오류만 남기며, 그 밖의 사실(의료·경제·세금·노동·부동산·기업·통계…)은 분야별 한국 공식 기관 사이트에서 먼저 확인한 뒤 웹 전체로 넓힙니다. " +
            "틀린 곳은 근거대로, 확인 안 된 곳은 단정하지 않게 고친 답(text)을 돌려줍니다. 답 1,000자마다 1건 과금, 확인을 끝내지 못하면 과금하지 않습니다. 보통 10~60초.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["answer"],
                  properties: {
                    question: { type: "string", maxLength: 4000, description: "사용자 질문(선택, 주면 법령 근거를 더 정확히 찾음)" },
                    answer: { type: "string", maxLength: 60000 },
                    level: { enum: ["fast", "standard", "deep"], default: "fast", description: "확인 깊이 — 답을 쓴 모델 등급에 맞춤" },
                    references: { type: "array", maxItems: 10, items: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } } }, description: "사용자가 대화에 준 자료(올린 파일 등, 합계 60,000자까지). 답이 이 자료를 옮긴 부분은 확인 대상에서 뺌" },
                    sources: { type: "array", maxItems: 30, items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" }, text: { type: "string", description: "그 페이지의 원문 발췌(검색 도구가 준 cited_text)" } } }, description: "답을 쓸 때 실제로 연 웹 페이지 발췌. 베리라인이 검색 전에 먼저 대조함(근거 문장이 발췌에 그대로 있어야 인정)" },
                    learn: { type: "boolean", default: false, description: "true 면 이 확인에서 '확인 안 됨 · 바로잡음' 사실 문장(개인정보는 거름)을 베리라인 정확도 개선에 씀 — 사용자 동의를 받은 서비스만 켤 것" },
                  },
                },
              },
            },
          },
          responses: {
            200: json({
              type: "object",
              properties: {
                text: { type: "string", description: "확인을 거친 답" },
                changed: { type: "boolean" },
                verification: {
                  type: "object",
                  properties: {
                    checked: { type: "boolean" },
                    articles: { type: "array", items: { type: "object" }, description: "대조한 현행 조문" },
                    fixes: { type: "array", items: { type: "object" }, description: "틀린 곳: quote, problem, law·label 또는 url, evidence, official" },
                    hedged: { type: "array", items: { type: "object" }, description: "확인 안 된 곳 — 단정하지 않게 고침" },
                    supported: { type: "array", items: { type: "object" }, description: "출처로 확인한 사실: claim, url, evidence, field, official(한국 공식 기관 출처인지)" },
                    facts_checked: { type: "integer" },
                    fact_check_failed: { type: "boolean" },
                    revise_failed: { type: "boolean", description: "고쳐 쓰기 실패 — text 끝에 바로잡을 곳을 붙임" },
                  },
                },
                level: { type: "string" },
                elapsed_ms: { type: "integer" },
                billed_units: { type: "integer" },
                usage: ref("Usage"),
              },
            }),
            ...errors(400, 401, 413, 429),
            502: json(ref("Error"), "check_failed — 과금되지 않음"),
          },
        },
      },
      "/v1/usage": {
        get: {
          operationId: "getUsage",
          summary: "이번 달 사용량·한도",
          responses: {
            200: json({
              type: "object",
              properties: {
                key: { type: "object", properties: { label: { type: "string" }, prefix: { type: "string" } } },
                rate_per_min: { type: "integer" },
                month: ref("Usage"),
              },
            }),
            ...errors(401),
          },
        },
      },
    },
    webhooks: {
      "verification.completed": {
        post: {
          summary: "검증이 끝나면(실패 포함) callback_url로 보냅니다",
          description: "헤더: X-Yume-Event, X-Yume-Delivery(재시도에도 같은 값), X-Yume-Timestamp, X-Yume-Signature(sha256=hex(hmac_sha256(callback_secret, timestamp + '.' + 원문 본문))). 2xx가 아니면 0·2·10·60초에 다시 보냅니다.",
          requestBody: { content: { "application/json": { schema: { allOf: [ref("Verification"), { type: "object", properties: { event: { const: "verification.completed" }, ref: { type: "string" } } }] } } } },
          responses: { 200: { description: "받음" } },
        },
      },
      "document.completed": {
        post: {
          summary: "문서 검사가 끝나면 보냅니다(원문 text는 빼고)",
          requestBody: { content: { "application/json": { schema: { allOf: [ref("Document"), { type: "object", properties: { event: { const: "document.completed" } } }] } } } },
          responses: { 200: { description: "받음" } },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "베리라인 계정 > API 키에서 발급한 yume_live_… 키. 서버에서만 쓰세요." } },
      parameters: {
        Id: { name: "id", in: "path", required: true, schema: { type: "string" } },
        IdempotencyKey: {
          name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 200 },
          description: "응답을 못 받아 다시 보내도 처음 결과를 과금 없이 돌려줍니다(24시간). 같은 키로 다른 내용을 보내면 422 idempotency_conflict.",
        },
      },
      responses: Object.fromEntries(
        [
          [400, "invalid_request · invalid_references · invalid_callback · invalid_idempotency_key"],
          [401, "invalid_api_key"],
          [404, "not_found"],
          [409, "idempotency_in_progress"],
          [413, "text_too_long"],
          [422, "idempotency_conflict"],
          [429, "rate_limited(Retry-After 헤더) · quota_exceeded"],
        ].map(([c, d]) => [`E${c}`, json(ref("Error"), d)]),
      ),
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } }, additionalProperties: true } },
        },
        Reference: { type: "object", required: ["text"], properties: { title: { type: "string" }, text: { type: "string" } } },
        Source: {
          type: "object",
          properties: { title: { type: "string" }, url: { type: "string" }, quote: { type: "string", description: "기준 자료(reference) 판정의 근거 문장" } },
        },
        Nec: {
          type: "object",
          description: "부존재 신뢰도. NEC = w1·C + w2·F + w3·(1−P). grade가 nonexistent(≥ threshold)이면 해당 주장은 false입니다.",
          properties: {
            score: { type: "number", minimum: 0, maximum: 1 },
            grade: { enum: ["nonexistent", "unverifiable"] },
            gradeLabel: { type: "string" },
            threshold: { type: "number" },
            identifier: { type: "object", properties: { type: { type: "string" }, value: { type: "string" }, canonical: { type: "string" }, searchSpace: { type: "string" } } },
            weights: { type: "object", additionalProperties: { type: "number" } },
            coverage: { type: "object" },
            formatError: { type: "object" },
            proximity: { type: "object" },
            uncovered: { type: "array", items: { type: "object" }, description: "아직 확인하지 못한 영역과 확인 방법" },
            summary: { type: "string" },
          },
        },
        Claim: {
          type: "object",
          required: ["text", "verdict", "verified_via"],
          properties: {
            text: { type: "string", description: "주장(한 주장에 사실 하나)" },
            quote: { type: "string", description: "원문 그대로의 해당 부분" },
            span: { type: "object", properties: { start: { type: "integer" }, end: { type: "integer" } }, description: "원문 속 위치(글자 단위, end 제외). text.slice(start, end) === quote" },
            domain: { enum: ["법률", "의료", "금융", "역사", "과학", "일반"] },
            verdict: { enum: ["confirmed", "false", "uncertain"] },
            verified_via: { enum: ["official", "reference", "nec", "web", "research", "unavailable"] },
            confidence: { enum: ["high", "medium"], description: "확인되지 않음이면 없음" },
            uncertain_reason: { enum: ["no_evidence", "not_public", "check_failed"] },
            absence_of: { type: "string", description: "주장이 '존재하지 않는다'고 말한 대상. 판정은 이 방향 기준" },
            explanation: { type: "string" },
            counter_fact: { type: "string", description: "false일 때 확인된 실제 값" },
            suggested_fix: { type: "string", description: "false일 때만 — 근거의 실제 값으로 고친 문장" },
            evidence: { type: "object", properties: { verified: { const: true }, url: { type: "string" }, quote: { type: "string" } }, description: "서버가 출처 페이지에서 직접 확인한 근거 문장" },
            sources: { type: "array", items: ref("Source") },
            effective_date: { type: "string", description: "대조한 법령의 시행일" },
            legal_ref: { type: "object" },
            identifiers: { type: "array", items: { type: "object" } },
            nec: ref("Nec"),
          },
        },
        Overall: {
          type: "object",
          properties: { label: { type: "string" }, tone: { enum: ["confirmed", "false", "unverified", "uncertain"] }, detail: { type: "string" } },
        },
        Usage: {
          type: "object",
          properties: { used: { type: "integer" }, quota: { type: "integer" }, remaining: { type: "integer" }, resets_at: { type: "string", format: "date-time" } },
        },
        Verification: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: { enum: ["pending", "done", "error"] },
            cached: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
            completed_at: { type: ["string", "null"], format: "date-time" },
            result: {
              type: ["object", "null"],
              properties: {
                verdict: ref("Overall"),
                domain: { type: "string" },
                summary: { type: ["string", "null"] },
                claims: { type: "array", items: ref("Claim") },
                engine: { type: ["string", "null"] },
              },
            },
            error: { type: ["object", "null"], properties: { code: { type: "string" }, message: { type: "string" } } },
            usage: ref("Usage"),
          },
        },
        Batch: {
          type: "object",
          properties: {
            count: { type: "integer" },
            pending: { type: "integer" },
            results: { type: "array", items: { allOf: [ref("Verification"), { type: "object", properties: { ref: { type: "string" } } }] } },
            usage: ref("Usage"),
          },
        },
        Document: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { const: "document" },
            title: { type: ["string", "null"] },
            created_at: { type: "string", format: "date-time" },
            length: { type: "integer", description: "원문 글자 수" },
            status: { enum: ["pending", "done", "partial", "error"] },
            parts: { type: "object", properties: { total: { type: "integer" }, done: { type: "integer" }, failed: { type: "integer" } } },
            result: {
              type: ["object", "null"],
              properties: {
                verdict: ref("Overall"),
                counts: { type: "object", properties: { claims: { type: "integer" }, false: { type: "integer" }, uncertain: { type: "integer" }, confirmed: { type: "integer" } } },
                claims: { type: "array", items: ref("Claim") },
                corrected_text: { type: "string" },
                fixes_applied: { type: "integer" },
              },
            },
            text: { type: "string" },
          },
        },
        Mark: {
          type: "object",
          properties: {
            id: { type: "string" },
            object: { const: "mark" },
            status: { enum: ["valid", "expired", "revoked"] },
            title: { type: ["string", "null"] },
            claims: { type: "integer", description: "확인된 주장 수" },
            first_issued_at: { type: "string", format: "date-time" },
            renewals: { type: "integer" },
            revoked_at: { type: ["string", "null"], format: "date-time" },
            url: { type: "string" },
            certificate_url: { type: "string" },
            badge_url: { type: "string" },
            embed_html: { type: "string" },
            text_hash: { type: "string" },
            issued_at: { type: "string", format: "date-time" },
            expires_at: { type: "string", format: "date-time" },
            renewed: { type: "boolean" },
          },
        },
      },
    },
  };
}
