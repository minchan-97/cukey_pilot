"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const LABEL: Record<string, string> = { correct: "맞음", partial: "부분 정답", wrong: "틀림" };

export default function Problem({ params }: { params: { id: string } }) {
  const [p, setP] = useState<any>(null);
  const [mine, setMine] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/problems/${params.id}`).then(async (r) => {
      const d = await r.json();
      r.ok ? setP(d) : setErr(d.error);
    });
  }, [params.id]);

  async function reveal() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/problems/${params.id}/reveal`, { method: "POST", body: JSON.stringify({ my_answer: mine }) });
    const d = await r.json();
    setBusy(false);
    r.ok ? setRes(d) : setErr(d.error);
  }

  async function confirm(verdict: "correct" | "wrong") {
    const r = await fetch(`/api/attempts/${res.attempt_id}/confirm`, { method: "POST", body: JSON.stringify({ verdict }) });
    const d = await r.json();
    r.ok ? setDone({ verdict, due: d.due_at }) : setErr(d.error);
  }

  if (err && !p) return <p className="err">{err}</p>;
  if (!p) return <p className="muted">문제 여는 중</p>;
  const answer = res?.answer ?? p.answer;
  const grounding = res?.grounding ?? p.grounding;

  return (
    <>
      <h1>{p.concept}</h1>
      <div className="stem">{p.stem}</div>

      {!answer && (
        <>
          <label htmlFor="mine">내 답</label>
          <textarea id="mine" value={mine} onChange={(e) => setMine(e.target.value)} placeholder="먼저 써 보고 해설을 열어요." />
          <p><button onClick={reveal} disabled={busy || !mine.trim()}>{busy ? "해설 만드는 중" : "답 내고 해설 보기"}</button></p>
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}

      {answer && (
        <>
          {res && <><h2>내 답</h2><div className="serif">{mine}</div></>}
          <h2>모범답안</h2>
          <div className="serif">{answer.model_answer}</div>
          <h2>해설</h2>
          <div className="serif">{answer.explanation}</div>
          <h2>근거</h2>
          {grounding?.filter((g: any) => answer.cites?.includes(g.id)).map((g: any) => (
            <div className="ground" key={g.id}>
              <Link href={`/book/${p.book_id}?page=${g.page_no}`}>{g.source}</Link>
              <div className="muted">{g.text.slice(0, 220)}{g.text.length > 220 ? "…" : ""}</div>
            </div>
          ))}
        </>
      )}

      {res && !done && (
        <>
          <h2>채점</h2>
          {res.suggest && (
            <p className="muted">AI 제안: {LABEL[res.suggest.suggest] ?? res.suggest.suggest}. {res.suggest.feedback}</p>
          )}
          <p className="muted">성적에는 내가 고른 판정만 들어가요.</p>
          <div className="verdict">
            <button className="ok" onClick={() => confirm("correct")}>맞았어요</button>
            <button className="bad" onClick={() => confirm("wrong")}>틀렸어요</button>
          </div>
        </>
      )}
      {done && (
        <p role="status">
          {done.verdict === "correct"
            ? `다음 복습은 ${new Date(done.due).toLocaleDateString("ko-KR")}이에요.`
            : "내일 아침 알림에 다시 올라와요."}{" "}
          <Link href="/weak">약한 개념으로</Link>
        </p>
      )}
    </>
  );
}
