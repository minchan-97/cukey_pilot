"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function Problems() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { fetch("/api/problems").then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d : [])); }, []);
  return (
    <>
      <h1>만든 문제</h1>
      <p className="muted">눌러서 다시 열 수 있어요. 이미 푼 문제는 '다시 풀기'로 처음부터 풀 수 있어요.</p>
      <ul className="list">
        {items?.map((p) => (
          <li key={p.id}>
            <div className="grow">
              <Link href={`/problem/${p.id}`}><strong>{p.concept}</strong></Link>
              <div className="muted">{p.type}{p.solved ? ", 푼 문제" : ", 아직 안 품"} · {new Date(p.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="muted">{p.stem.replace(/\s+/g, " ").slice(0, 90)}{p.stem.length > 90 ? "…" : ""}</div>
            </div>
          </li>
        ))}
        {items && !items.length && <li className="muted">약한 개념에서 문제를 만들면 여기에 쌓여요.</li>}
      </ul>
    </>
  );
}
