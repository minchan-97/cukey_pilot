"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { extractPages } from "@/lib/pdf";

const SUBJECTS = ["국어", "영어", "수학", "사회", "과학", "도덕", "실과", "미술", "음악", "체육", "통합교과", "창의적체험활동", "총론"];
type Book = { id: string; title: string; subject: string; page_count: number | null };

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("국어");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/books").then((r) => r.json()).then((d) => Array.isArray(d) && setBooks(d));
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!file || !title.trim()) return;
    setBusy(true);
    let bookId = "";
    try {
      setStatus("교재 등록 중");
      const r = await fetch("/api/books", { method: "POST", body: JSON.stringify({ title, subject }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      bookId = b.id;

      setStatus("PDF 올리는 중");
      // Supabase 공식 클라이언트와 같은 방식(FormData)으로 올린다
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      const put = await fetch(b.uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "true" } });
      if (!put.ok) throw new Error(`PDF 업로드 실패 (${put.status}) ${(await put.text()).slice(0, 120)}`);
      const chk = await fetch(`/api/books/${b.id}?check=1`).then((x) => x.json());
      if (!chk.exists) throw new Error("PDF가 저장소에 저장되지 않았어요. 다시 시도해 주세요.");

      const { pages, numPages, reread, failed } = await extractPages(file, setStatus);
      for (let i = 0; i < pages.length; i += 50) {
        const pr = await fetch(`/api/books/${b.id}/pages`, {
          method: "POST", body: JSON.stringify({ pages: pages.slice(i, i + 50), page_count: numPages }),
        });
        if (!pr.ok) throw new Error((await pr.json()).error);
      }
      setStatus(`등록했어요. ${numPages}쪽` +
        (reread ? ` 중 ${reread}쪽은 글자가 깨져 이미지로 읽었어요.` : "") +
        (failed ? ` ${failed}쪽은 읽지 못해서, 표시할 때 내용을 직접 적어야 해요.` : ""));
      setTitle(""); setFile(null); load();
    } catch (e: any) {
      // 반쪽짜리 교재가 목록에 남지 않게 지운다
      if (bookId) await fetch(`/api/books/${bookId}`, { method: "DELETE" }).catch(() => {});
      setStatus(e.message);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function removeBook(id: string, name: string) {
    if (!window.confirm(`'${name}'을(를) 지울까요? 표시한 내용과 약한 개념도 함께 지워져요.`)) return;
    await fetch(`/api/books/${id}`, { method: "DELETE" });
    load();
  }

  async function enablePush() {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
      await fetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) });
      setStatus("아침 알림을 켰어요.");
    } catch {
      setStatus("알림을 켜지 못했어요. 아이폰은 홈 화면에 추가한 뒤 그 앱에서 켜야 해요.");
    }
  }

  return (
    <>
      <h1>교재</h1>
      <ul className="list">
        {books.map((b) => (
          <li key={b.id}>
            <div className="grow">
              <Link href={`/book/${b.id}`}>{b.title}</Link>
              <div className="muted">{b.subject}{b.page_count ? `, ${b.page_count}쪽` : ""}</div>
            </div>
            <button className="ghost" onClick={() => removeBook(b.id, b.title)}>지우기</button>
          </li>
        ))}
        {!books.length && <li className="muted">교재 PDF를 올리면 여기서 열 수 있어요.</li>}
      </ul>

      <h2>교재 올리기</h2>
      <label htmlFor="t">교재명</label>
      <input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 국어 각론 1권" />
      <label htmlFor="s">과목</label>
      <select id="s" value={subject} onChange={(e) => setSubject(e.target.value)}>
        {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
      </select>
      <label htmlFor="f">PDF</label>
      <input id="f" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <p style={{ display: "flex", gap: 8 }}>
        <button onClick={upload} disabled={busy || !file || !title.trim()}>올리기</button>
        <button className="ghost" onClick={enablePush}>아침 알림 켜기</button>
      </p>
      {status && <p className="muted" role="status">{status}</p>}
    </>
  );
}
