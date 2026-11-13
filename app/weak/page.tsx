"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Weak() {
  const router = useRouter();
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/weak").then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(() => { load(); }, []);

  async function makeProblem(id: string, type: "blank" | "case") {
    setBusy(id + type); setMsg("");
    const r = await fetch("/api/problems", { method: "POST", body: JSON.stringify({ concept_id: id, type }) });
    const d = await r.json();
    setBusy("");
    r.ok ? router.push(`/problem/${d.id}`) : setMsg(d.error);
  }

  async function rename(id: string, name: string) {
    const next = window.prompt("개념 이름", name);
    if (!next || next === name) return;
    const r = await fetch(`/api/concepts/${id}`, { method: "PATCH", body: JSON.stringify({ name: next }) });
    if (!r.ok) setMsg((await r.json()).error);
    load();
  }

  return (
    <>
      <h1>약한 개념</h1>
      <p className="muted">표시가 많고, 틀렸고, 복습할 때가 된 개념이 위로 와요.</p>
      {msg && <p className="err" role="alert">{msg}</p>}
      <ul className="list">
        {items?.map((c) => (
          <li key={c.id}>
            <div className="grow">
              <strong>{c.name}</strong>
              <div className="muted">{c.book_title}, {c.why.join(", ")}</div>
            </div>
            <button className="ghost" onClick={() => rename(c.id, c.name)}>이름</button>
            <button onClick={() => makeProblem(c.id, "blank")} disabled={!!busy}>{busy === c.id + "blank" ? "만드는 중" : "빈칸형"}</button>
            <button onClick={() => makeProblem(c.id, "case")} disabled={!!busy}>{busy === c.id + "case" ? "만드는 중" : "사례형"}</button>
          </li>
        ))}
        {items && !items.length && <li className="muted">교재에서 모르는 부분을 표시하면 여기에 쌓여요.</li>}
      </ul>
    </>
  );
}
