// 첫 화면에 필요 없는 것은 첫 화면에 실리지 않게.
//
// 유메의 첫 화면은 입력창 하나다. 그런데 번들에는 로그인 창, 계정 창, 감사 리포트 창,
// 결제 화면, 기다리는 동안 하는 게임까지 전부 들어 있었다 — 누르기 전에는 한 번도
// 그려지지 않는 것들이다. 처음 오는 사람이 그 전부를 내려받고 나서야 입력창을 본다.
//
// 이 파일은 그것들을 "누를 때 가져오는" 것으로 바꾼다. 화면에서 쓰는 이름은 그대로라
// 호출부는 달라지지 않고, 가져오는 동안 무엇을 보여줄지만 한 곳에서 정한다.
//
// 어디에 Suspense를 두는가 — 모달과 게임은 열릴 때 잠깐 빈 화면이어도 괜찮다(이미
// 무언가를 누른 뒤다). 대신 첫 화면에 늘 보이는 것은 여기 넣지 않는다. 나중에 나타나면
// 레이아웃이 밀려서, 아낀 것보다 어지러운 것이 크다.
import { Suspense, lazy } from "react";

const load = (importer) => {
  const C = lazy(importer);
  // 가져오는 동안은 아무것도 그리지 않는다. 누른 직후라 스피너가 오히려 깜빡임이 된다.
  return function Chunked(props) {
    return (
      <Suspense fallback={null}>
        <C {...props} />
      </Suspense>
    );
  };
};

export const AuthModal = load(() => import("@/components/yume/AuthModal"));
export const AccountModal = load(() => import("@/components/yume/AccountModal"));
export const AuditModal = load(() => import("@/components/yume/AuditModal.jsx"));
export const CheckoutPage = load(() => import("@/components/yume/CheckoutPage"));
// 운영자만 여는 검토함. 일반 사용자 번들에 실릴 이유가 없다.
export const ReviewModal = load(() => import("@/components/yume/ReviewModal"));
export const CatMouseGame = load(() => import("@/components/yume/CatMouseGame"));

// 사이드바 자체는 남겨 둔다 — 닫히는 동작(exit 애니메이션)을 그리려면 떠 있어야 한다.
// 안에 든 채팅·랭킹만 열 때 가져온다. 사이드바를 한 번도 안 여는 사람이 대부분이다.
export const LobbyPanel = load(() => import("@/components/yume/LobbyChat.jsx"));
export const RankingPanel = load(() => import("@/components/yume/RankingPanel.jsx"));
