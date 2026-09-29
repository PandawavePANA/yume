// 대화에 붙일 사진을 보내기 좋은 크기로 줄인다.
//
// 휴대폰 사진은 한 장이 4~10MB다. 그대로 보내면 느리고, 서버는 3MB에서 자른다. 긴 변을
// 1920px로 줄이고 JPEG로 다시 담으면 보통 200~500KB가 된다 — 화면에서 보기에는 차이가 없다.
// 스크린샷(PNG)도 같은 길로 간다. 글자가 있는 화면은 품질 0.86이면 번지지 않는다.
const MAX_SIDE = 1920;
const QUALITY = 0.86;

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* 일부 브라우저는 옵션을 모른다 — 아래 길로 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** File → JPEG data URL. 사진이 아니면 오류. */
export async function shrinkPhoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("사진 파일만 보낼 수 있어요.");
  const src = await decode(file);
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  // 투명한 PNG가 JPEG로 바뀌면 검게 나온다. 흰 바탕을 먼저 깐다.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export const MAX_PHOTOS = 6;
