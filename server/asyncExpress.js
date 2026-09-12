// Express 4는 async 핸들러가 던진 오류(거부된 Promise)를 에러 핸들러로 넘기지 않아, DB 오류가
// 나면 요청이 응답 없이 멈춘다. 라우터·앱의 등록 메서드를 감싸 거부를 next(err)로 보낸다.
// 인자가 4개인 에러 처리 미들웨어는 그대로 둔다.
function wrap(fn) {
  return function asyncSafe(req, res, next) {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === "function") out.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

export function patchAsync(target) {
  for (const method of ["use", "get", "post", "put", "patch", "delete", "all"]) {
    const original = target[method].bind(target);
    target[method] = (...args) => original(...args.map((a) => (typeof a === "function" && a.length < 4 ? wrap(a) : a)));
  }
  return target;
}
