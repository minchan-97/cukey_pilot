"use client";
import { useEffect, useState } from "react";

export default function Report() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { fetch("/api/report").then((r) => r.json()).then((d) => setRows(Array.isArray(d) ? d : [])); }, []);
  return (
    <>
      <h1>수강생 약점 모아보기</h1>
      <p className="muted">개념별로 몇 명이 어려워했는지만 보여요. 누가 표시했는지는 나오지 않아요. 모의고사 출제 범위를 잡을 때 쓰세요.</p>
      <div className="scroll">
        <table>
          <thead><tr><th>개념</th><th>교재</th><th>수강생</th><th>표시</th><th>정답률</th></tr></thead>
          <tbody>
            {rows?.map((r, i) => (
              <tr key={i}>
                <td>{r.concept}</td><td>{r.book}</td><td>{r.users}명</td><td>{r.marks}번</td>
                <td>{r.rate === null ? "풀이 없음" : `${r.rate}% (${r.total}회)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows && !rows.length && <p className="muted">아직 표시된 개념이 없어요.</p>}
    </>
  );
}
