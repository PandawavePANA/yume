// 대화 하나가 어느 일감에 속하는지 — 일감이 둘로 갈라지지 않게 하는 한 곳.
//
// 일감이 생기는 길이 셋 있다(보드의 "일감으로", 의뢰인의 견적 결제, 데스크의 "일감 만들기").
// 예전에는 결제와 데스크가 대화에 적힌 일감(threads.project_id)만 찾았는데, "일감으로"는
// 대화에 아무것도 적지 않았다. 그래서 문의를 일감으로 옮긴 뒤 결제가 들어오면 옮긴 일감을
// 못 찾고 새 일감을 만들었다. 옮긴 일감은 영원히 "상담"에 남고, 돈은 옆에 새로 선 일감에
// 붙었다 — 총합 대시보드가 "진행 중으로 안 바뀌던" 이유다.
//
// 셋이 공유하는 열쇠는 문의 번호(inquiry_id)다. 대화도 일감도 그걸 들고 있다. 대화에 적힌
// 일감이 없으면 같은 문의에서 나온 일감을 찾고, 찾으면 대화에 적어 둔다(다음부터 바로 찾게).
import { now, one, run, tx } from "./db.js";

export async function projectForThread(thread) {
  if (!thread) return null;
  if (thread.project_id) {
    const p = await one("SELECT * FROM projects WHERE id = :id", { id: thread.project_id });
    if (p) return p;
  }
  if (thread.inquiry_id) {
    // 같은 문의에서 일감이 둘 나왔을 리는 없지만(옮기기는 중복을 막는다), 예전 데이터에는
    // 있을 수 있다. 먼저 생긴 쪽 — 문의 내용을 들고 있는 쪽 — 을 고른다.
    const p = await one("SELECT * FROM projects WHERE inquiry_id = :iid ORDER BY id LIMIT 1", { iid: thread.inquiry_id });
    if (p) {
      await run("UPDATE threads SET project_id = :pid, updated_at = :t WHERE id = :id", { pid: p.id, t: now(), id: thread.id });
      return p;
    }
  }
  return null;
}

/** 문의를 일감으로 옮겼을 때, 그 문의에서 열린 대화들을 새 일감에 잇는다. */
export async function linkThreadsToProject(inquiryId, projectId) {
  if (!inquiryId || !projectId) return;
  await run(
    "UPDATE threads SET project_id = :pid, updated_at = :t WHERE inquiry_id = :iid AND project_id IS NULL",
    { pid: projectId, iid: inquiryId, t: now() },
  );
}

/**
 * 같은 문의에서 갈라져 나온 일감들. 위 연결이 없던 동안 생긴 것들이다.
 * 보드가 이걸 보여 주고, 사장이 한 번 눌러 합친다 — 돈이 붙은 줄을 알아서 지우지는 않는다.
 */
export function findSplitProjects(projects) {
  const byInquiry = new Map();
  for (const p of projects) {
    if (!p.inquiry_id || p.status === "dropped") continue;
    const list = byInquiry.get(p.inquiry_id) || [];
    list.push(p);
    byInquiry.set(p.inquiry_id, list);
  }
  return [...byInquiry.values()]
    .filter((list) => list.length > 1)
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.id - b.id);
      // 남길 쪽은 먼저 생긴 것이다. 보드에서 "일감으로" 옮겨 둔 것이라 사장이 보던 카드이고,
      // 마감일·메모·할 일도 거기에 적어 뒀을 가능성이 크다.
      return { keep: sorted[0], from: sorted.slice(1) };
    });
}

/**
 * 일감 둘을 하나로 합친다. keep이 남고 from은 사라진다.
 *
 * 합치는 조건: 같은 문의에서 나온 것만. 아무 일감이나 합칠 수 있게 두면 버튼 하나 잘못 눌러
 * 두 고객의 돈이 섞인다.
 *
 * 옮기는 것: 받은 돈(더한다), 계약 금액(큰 쪽), 시작일·마감·미리보기·진행률(비어 있으면 채운다),
 * 대화의 연결, 할 일 목록. 받은 돈이 있거나 옮겨 오는 쪽이 이미 진행 중이면 남는 쪽도 진행 중이 된다.
 */
export async function mergeProjects(keepId, fromId) {
  if (!keepId || !fromId || keepId === fromId) return { error: "합칠 일감을 다시 골라주세요." };
  return tx(async (q) => {
    const keep = await q.one("SELECT * FROM projects WHERE id = :id", { id: keepId });
    const from = await q.one("SELECT * FROM projects WHERE id = :id", { id: fromId });
    if (!keep || !from) return { error: "일감을 찾을 수 없어요." };
    if (!keep.inquiry_id || keep.inquiry_id !== from.inquiry_id) {
      return { error: "같은 의뢰에서 나온 일감만 합칠 수 있어요." };
    }
    const paid = Number(keep.paid_krw || 0) + Number(from.paid_krw || 0);
    const amount = Math.max(Number(keep.amount_krw || 0), Number(from.amount_krw || 0), paid);
    const started = ["active", "done"].includes(from.status) || paid > 0;
    const status = started && ["lead", "dropped"].includes(keep.status) ? "active" : keep.status;
    const t = now();
    await q.run(
      `UPDATE projects SET paid_krw = :paid, amount_krw = :amount, status = :status,
         started_at = COALESCE(started_at, :started), due_at = COALESCE(due_at, :due),
         preview_url = COALESCE(preview_url, :preview), progress = GREATEST(progress, :progress),
         updated_at = :t
       WHERE id = :id`,
      {
        id: keep.id, paid, amount, status, t,
        started: from.started_at || (started ? t : null),
        due: from.due_at, preview: from.preview_url || null, progress: Number(from.progress || 0),
      },
    );
    await q.run("UPDATE threads SET project_id = :keep, updated_at = :t WHERE project_id = :from", { keep: keep.id, from: from.id, t });
    await q.run("UPDATE product_tasks SET product = :k WHERE product = :f", { k: `project:${keep.id}`, f: `project:${from.id}` });
    await q.run("DELETE FROM projects WHERE id = :id", { id: from.id });
    return { ok: true, id: keep.id, status, paid };
  });
}
