// 진행 상황 — 의뢰인이 "지금 어디까지 됐나"를 물어보지 않고도 알게 하는 부분.
//
// 단계는 **따로 입력받지 않고 계산한다.** 손으로 고치는 칸을 하나 더 두면 반드시
// 잊어버리고, 화면에 적힌 단계와 실제가 어긋나는 순간 이 화면 전체를 못 믿게 된다.
// 이미 있는 사실(견적이 확정됐는지, 결제가 됐는지, 일감이 끝났는지)에서 끌어낸다.
//
// 진행률도 같은 이유로 공개된 체크리스트에서 센다. 막대가 70%라고 하는데 그 아래
// 목록은 열 개 중 둘만 체크돼 있으면, 둘 중 하나는 거짓말이다. 체크리스트가 아직
// 없을 때만 일감에 적어 둔 숫자를 쓴다.
import { all, one } from "./db.js";

export const STAGES = [
  { key: "talk", label: "상담" },
  { key: "quote", label: "견적 확정" },
  { key: "build", label: "개발" },
  { key: "done", label: "인수" },
];

export const taskKey = (projectId) => `project:${projectId}`;

/** 의뢰인에게 공개된 체크리스트. 내부 메모는 shared가 꺼져 있어 여기 오지 않는다. */
export const sharedTasks = (projectId) =>
  all(
    "SELECT id, title, state, sort FROM product_tasks WHERE product = :k AND shared = TRUE ORDER BY sort, id",
    { k: taskKey(projectId) },
  );

/**
 * 대화 하나의 진행 상황. 화면에 그릴 수 있는 형태로 돌려준다.
 *
 * show가 false면 아직 보여 줄 것이 없다는 뜻이다 — 상담만 하고 있는 단계에서
 * 텅 빈 진행 막대를 띄우면, 아무 일도 일어나지 않고 있다는 인상만 준다.
 */
export async function progressFor(thread) {
  const quotes = await all("SELECT status FROM thread_quotes WHERE thread_id = :id", { id: thread.id });
  const project = thread.project_id
    ? await one("SELECT * FROM projects WHERE id = :id", { id: thread.project_id })
    : null;

  const paid = quotes.some((q) => q.status === "paid");
  const accepted = quotes.some((q) => q.status === "accepted");

  let stage = "talk";
  if (accepted) stage = "quote";
  if (paid || project?.status === "active") stage = "build";
  if (project?.status === "done") stage = "done";

  const tasks = project ? await sharedTasks(project.id) : [];
  const doneCount = tasks.filter((t) => t.state === "done").length;
  const percent = tasks.length
    ? Math.round((doneCount / tasks.length) * 100)
    : Math.max(0, Math.min(100, Number(project?.progress || 0)));

  return {
    stage,
    stages: STAGES,
    percent,
    // 인수가 끝났으면 막대와 관계없이 100으로 읽혀야 한다.
    done: stage === "done",
    previewUrl: safeUrl(project?.preview_url),
    tasks: tasks.map((t) => ({ title: t.title, done: t.state === "done", doing: t.state === "doing" })),
    taskCount: tasks.length,
    taskDone: doneCount,
    startedAt: project?.started_at ? Number(project.started_at) : null,
    dueAt: project?.due_at ? Number(project.due_at) : null,
    doneAt: project?.done_at ? Number(project.done_at) : null,
    // 상담만 하고 있는 동안에는 진행 칸 자체를 띄우지 않는다.
    show: stage !== "talk",
  };
}

// 미리보기 주소는 우리가 적지만, 오타 하나로 의뢰인 화면에 javascript: 링크가
// 걸리는 일은 없어야 한다. http(s)만 통과시킨다.
function safeUrl(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
