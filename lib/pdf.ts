// 브라우저 전용. 구형 iOS 사파리까지 고려해 legacy 빌드를 쓴다.
export async function loadPdfjs(): Promise<any> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

/** 업로드 직후 쪽별 본문 추출 → 근거 데이터가 된다 */
export async function extractPages(file: File, onProgress?: (done: number, total: number) => void) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: { page_no: number; text: string }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const text = tc.items.map((it: any) => it.str + (it.hasEOL ? "\n" : "")).join("")
      .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    pages.push({ page_no: n, text });
    onProgress?.(n, doc.numPages);
  }
  return { pages, numPages: doc.numPages as number };
}
