"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const PdfMarker = dynamic(() => import("@/components/PdfMarker"), { ssr: false });

function BookInner({ params }: { params: { id: string } }) {
  const sp = useSearchParams();
  const [book, setBook] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/books/${params.id}`).then(async (r) => {
      const d = await r.json();
      r.ok ? setBook(d) : setErr(d.error);
    });
  }, [params.id]);

  if (err) return <p className="err">{err}</p>;
  if (!book) return <p className="muted">교재 여는 중</p>;
  return (
    <>
      <h1>{book.title}</h1>
      <PdfMarker bookId={book.id} fileUrl={book.fileUrl} initialPage={Number(sp.get("page")) || 1} />
    </>
  );
}

export default function BookPage(props: { params: { id: string } }) {
  return <Suspense fallback={<p className="muted">교재 여는 중</p>}><BookInner {...props} /></Suspense>;
}
