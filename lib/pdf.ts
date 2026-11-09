import { cleanText, looksBroken } from "./clean";

// 브라우저 전용. 구형 iOS 사파리까지 고려해 legacy 빌드를 쓴다.
export async function loadPdfjs(): Promise<any> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // 워커는 번들링하지 않고 public에 복사된 파일을 쓴다(package.json postinstall)
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

async function pageImage(page: any, longSide = 1600) {
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: longSide / Math.max(base.width, base.height) });
  const c = document.createElement("canvas");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c.toDataURL("image/jpeg", 0.85);
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
        const image = await pageImage(await doc.getPage(n));
        const r = await fetch("/api/ocr", { method: "POST", body: JSON.stringify({ image, mode: "page" }) });
        const d = await r.json();
        if (r.ok && d.text) pages[n - 1].text = d.text; else failed++;
      } catch { failed++; }
      onProgress?.(`글자가 깨진 쪽을 이미지로 읽는 중 ${++done}/${redo.length}쪽`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { pages, numPages: doc.numPages as number, reread: redo.length, failed };
}
