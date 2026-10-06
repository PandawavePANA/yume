// 장식은 본문을 끌고 내려가면 안 된다.
//
// 실제로 그렇게 됐다. 꼬리의 입자 글자(ParticleWord)가 폭 0인 캔버스에서 getImageData를
// 부르다 예외를 냈고, 리액트는 효과 안의 예외를 만나면 트리 전체를 내린다. 결과는 사이트
// 전체가 빈 화면이었다 — 연락처도, 작업물도, 상담 신청도 전부 사라졌다. 움직임 하나 때문에.
//
// 배경, 커서 격자, 터미널, 입자 글자는 없어도 사이트가 제 할 일을 한다. 그러니 이것들이
// 무슨 이유로 터지든 그 자리만 비우고 나머지는 그대로 둔다. 원인은 콘솔에 남긴다 —
// 조용히 삼키면 고칠 기회가 없다.
import { Component } from "react";

export default class Decor extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(`[decor:${this.props.name || "?"}] 장식이 멈췄어요 — 이 자리만 비우고 계속합니다.`, error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
