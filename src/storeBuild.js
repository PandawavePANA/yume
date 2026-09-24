// 플레이스토어·앱스토어에 올리는 빌드인가.
//
// 앱은 이 저장소의 같은 코드로 만들지만 **웹과 다른 결과물**이다(`npm run build:app` → dist-app).
// 두 스토어 모두 앱 안에서 디지털 상품을 자기네 결제 밖으로 파는 것을 금지하고, "웹에서
// 사세요" 같은 안내조차 막는다. 그래서 스토어용 빌드에서는 결제로 가는 길을 통째로 뺀다.
//
// 웹 빌드(`npm run build`)에서는 이 값이 false이므로 **웹 화면은 하나도 바뀌지 않는다.**
export const IS_STORE_BUILD = import.meta.env?.VITE_STORE_BUILD === "play";
