import { cleanText, looksBroken } from "./clean";

// 브라우저 전용. 구형 iOS 사파리까지 고려해 legacy 빌드를 쓴다.
export async function loadPdfjs(): Promise<any> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // 워커는 번들링하지 않고 public에 복사된 파일을 쓴다(package.json postinstall)
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

export type Rect = { x: number; y: number; w: number; h: number }; // 쪽 크기 대비 0~1

/**
 * PDF에서 영역(없으면 쪽 전체)을 가로 targetWidth 픽셀로 새로 그린다.
 * 화면 캔버스를 자르면 글자가 작아 판독이 나빠지므로, 원본 PDF에서 크게 다시 그린다.
 * 영역만 그리므로 확대해도 메모리가 작다(아이폰 캔버스 한도 회피).
 */
export async function renderRegion(page: any, r: Rect | null, targetWidth = 1536) {
  const base = page.getViewport({ scale: 1 });
  const rx = r ? Math.max(0, r.x - 0.01) : 0, ry = r ? Math.max(0, r.y - 0.008) : 0;
  const rw = r ? Math.min(1 - rx, r.w + 0.02) : 1, rh = r ? Math.min(1 - ry, r.h + 0.016) : 1;
  const scale = Math.min(targetWidth / (rw * base.width), 8);
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.ceil(rw * vp.width); c.height = Math.ceil(rh * vp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -rx * vp.width, -ry * vp.height] }).promise;
  return c;
}

/**
 * 판독 AI는 큰 이미지를 짧은 변 768px로 줄여 버려 작은 글자가 뭉개진다.
 * 그래서 긴 이미지는 '글자가 없는 줄'에서 잘라 띠 여러 장으로 보낸다(위에서 아래 순서).
 */
export function toStrips(c: HTMLCanvasElement, maxH = 640): string[] {
  if (c.height <= maxH * 1.2) return [c.toDataURL("image/jpeg", 0.92)];
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const ink = (y: number) => {
    const row = ctx.getImageData(0, y, c.width, 1).data;
    let n = 0;
    for (let i = 0; i < row.length; i += 16) if (row[i] + row[i + 1] + row[i + 2] < 600) n++;
    return n;
  };
  const cuts = [0];
  while (c.height - cuts[cuts.length - 1] > maxH * 1.2) {
    const target = cuts[cuts.length - 1] + maxH;
    let best = target, bestInk = Infinity;
    for (let y = target; y > target - 160; y -= 2) {
      const k = ink(y);
      if (k < bestInk) { best = y; bestInk = k; if (k === 0) break; }
    }
    cuts.push(best);
  }
  cuts.push(c.height);
  const out: string[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const h = cuts[k + 1] - cuts[k];
    const s = document.createElement("canvas");
    s.width = c.width; s.height = h;
    s.getContext("2d")!.drawImage(c, 0, cuts[k], c.width, h, 0, 0, c.width, h);
    out.push(s.toDataURL("image/jpeg", 0.92));
  }
  return out;
}

/** 영역(또는 쪽)을 고해상도로 그려 판독. 실패하면 빈 문자열 */
export async function ocrRegion(page: any, r: Rect | null, mode: "page" | "region") {
  const images = toStrips(await renderRegion(page, r));
  for (let tryNo = 0; tryNo < 2; tryNo++) {      // 시간 초과 등으로 실패하면 한 번 더
    try {
      const res = await fetch("/api/ocr", { method: "POST", body: JSON.stringify({ images, mode }) });
      const d = await res.json();
      if (res.ok && d.text) return d.text as string;
    } catch { /* 다음 시도 */ }
  }
  return "";
}

export type Progress = (msg: string) => void;

/**
 * 업로드 직후 쪽별 본문 추출 → 근거 데이터가 된다.
 * 글자층이 깨졌거나 없는 쪽은 이미지로 다시 읽는다(동시에 3쪽씩).
 */
export async function extractPages(file: File, onProgress?: Progress) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: { page_no: number; text: string }[] = [];
  const redo: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const raw = tc.items.map((it: any) => it.str + (it.hasEOL ? "\n" : "")).join("");
    const text = cleanText(raw);
    pages.push({ page_no: n, text });
    if (!text || looksBroken(text)) redo.push(n);
    onProgress?.(`본문 읽는 중 ${n}/${doc.numPages}쪽`);
  }

  let done = 0, failed = 0;
  const queue = [...redo];
  const worker = async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) {
      try {
        const text = await ocrRegion(await doc.getPage(n), null, "page");
        if (text) pages[n - 1].text = text; else failed++;
      } catch { failed++; }
      onProgress?.(`글자가 깨진 쪽을 이미지로 읽는 중 ${++done}/${redo.length}쪽`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { pages, numPages: doc.numPages as number, reread: redo.length, failed };
}
