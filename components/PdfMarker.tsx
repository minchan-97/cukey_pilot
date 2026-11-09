"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdf";

type Rect = { x: number; y: number; w: number; h: number };          // 쪽 크기 대비 0~1
type Item = Rect & { str: string };
type Mark = { id: string; page_no: number; rects: Rect[]; text: string; concepts?: { name: string } | null };

const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
});

/** 드래그한 영역 안의 글자를 읽는 순서대로 모은다 */
function textIn(r: Rect, items: Item[]) {
  const hit = items.filter((it) => {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    return cy >= r.y && cy <= r.y + r.h && it.x + it.w >= r.x && it.x <= r.x + r.w;
  }).sort((a, b) => (Math.abs(a.y - b.y) < a.h * 0.5 ? a.x - b.x : a.y - b.y));
  let out = "", lastY = -1;
  for (const it of hit) {
    if (lastY >= 0 && Math.abs(it.y - lastY) > it.h * 0.5) out += "\n";
    out += it.str;
    lastY = it.y;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

export default function PdfMarker({ bookId, fileUrl, initialPage = 1 }: { bookId: string; fileUrl: string; initialPage?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const task = useRef<any>(null);
  const [doc, setDoc] = useState<any>(null);
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [pageNo, setPageNo] = useState(initialPage);
  const [width, setWidth] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [marking, setMarking] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [draftText, setDraftText] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPdfjs().then(async (lib) => {
      const d = await lib.getDocument({ url: fileUrl }).promise;
      if (alive) { setPdfjs(lib); setDoc(d); }
    }).catch(() => setMsg("교재를 열지 못했어요. 새로고침해 주세요."));
    return () => { alive = false; };
  }, [fileUrl]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const loadMarks = useCallback(() => {
    fetch(`/api/marks?book=${bookId}&page=${pageNo}`).then((r) => r.json()).then((d) => Array.isArray(d) && setMarks(d));
  }, [bookId, pageNo]);
  useEffect(loadMarks, [loadMarks]);

  useEffect(() => {
    if (!doc || !pdfjs || !width || !canvas.current) return;
    let alive = true;
    (async () => {
      const page = await doc.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: width / base.width });
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current!;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      task.current?.cancel();
      task.current = page.render({ canvasContext: c.getContext("2d")!, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try { await task.current.promise; } catch { return; }
      const tc = await page.getTextContent();
      if (!alive) return;
      setItems(tc.items.filter((it: any) => it.str?.trim()).map((it: any) => {
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        const h = Math.hypot(t[2], t[3]);
        return { str: it.str, x: t[4] / vp.width, y: (t[5] - h) / vp.height, w: (it.width * vp.scale) / vp.width, h: h / vp.height };
      }));
    })();
    return () => { alive = false; };
  }, [doc, pdfjs, pageNo, width]);

  const pt = (e: React.PointerEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };

  function onDown(e: React.PointerEvent) {
    if (!marking) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pt(e); setStart(p); setDraft({ x: p.x, y: p.y, w: 0, h: 0 }); setDraftText("");
  }
  function onMove(e: React.PointerEvent) { if (start) setDraft(norm(start, pt(e))); }
  function onUp(e: React.PointerEvent) {
    if (!start) return;
    const r = norm(start, pt(e)); setStart(null);
    if (r.w < 0.01 || r.h < 0.005) { setDraft(null); return; }
    setDraft(r);
    const t = textIn(r, items);
    setDraftText(t);
    setMsg(t ? "" : "이 영역에서 글자를 못 읽었어요(그림·스캔). 어떤 내용인지 직접 적어 주세요.");
  }

  async function save() {
    if (!draft || !draftText.trim()) return;
    setSaving(true);
    const r = await fetch("/api/marks", { method: "POST", body: JSON.stringify({ book_id: bookId, page_no: pageNo, rects: [draft], text: draftText }) });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setMsg(d.error); return; }
    setDraft(null); setDraftText("");
    setMsg(`'${d.concept.name}'에 쌓았어요.`);
    loadMarks();
  }

  async function remove(id: string) {
    await fetch(`/api/marks?id=${id}`, { method: "DELETE" });
    loadMarks();
  }

  const go = (n: number) => { if (doc && n >= 1 && n <= doc.numPages) { setPageNo(n); setDraft(null); setMsg(""); } };

  return (
    <>
      <div className="toolbar">
        <button className="ghost" onClick={() => go(pageNo - 1)} disabled={pageNo <= 1}>이전</button>
        <button className="ghost" onClick={() => go(pageNo + 1)} disabled={!doc || pageNo >= doc.numPages}>다음</button>
        <span className="page">{pageNo}{doc ? ` / ${doc.numPages}` : ""}쪽</span>
        <button className={marking ? "ghost marking-on" : "ghost"} aria-pressed={marking} onClick={() => { setMarking(!marking); setDraft(null); }}>
          {marking ? "표시하는 중" : "모르는 부분 표시"}
        </button>
      </div>

      <div className="sheet" ref={wrap}>
        <canvas ref={canvas} />
        <div className={`overlay${marking ? " marking" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
          {marks.flatMap((m) => m.rects.map((r, i) => (
            <div key={m.id + i} className="hl" title={m.concepts?.name ?? ""}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
          )))}
          {draft && <div className="hl draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}
        </div>
      </div>

      {draft && !start && (
        <div className="sheetbar">
          <label htmlFor="dt">표시한 내용</label>
          <textarea id="dt" value={draftText} onChange={(e) => setDraftText(e.target.value)} style={{ minHeight: 80 }} />
          <p style={{ display: "flex", gap: 8, margin: "10px 0 0" }}>
            <button onClick={save} disabled={saving || !draftText.trim()}>{saving ? "저장 중" : "약한 개념에 쌓기"}</button>
            <button className="ghost" onClick={() => setDraft(null)}>취소</button>
          </p>
        </div>
      )}
      {msg && <p className="muted" role="status">{msg}</p>}

      {!!marks.length && (
        <>
          <h2>이 쪽에서 표시한 곳</h2>
          <ul className="list">
            {marks.map((m) => (
              <li key={m.id}>
                <div className="grow">
                  <strong>{m.concepts?.name ?? "개념 미정"}</strong>
                  <div className="muted">{m.text.slice(0, 80)}{m.text.length > 80 ? "…" : ""}</div>
                </div>
                <button className="ghost" onClick={() => remove(m.id)}>지우기</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
