import { db, json, fail } from "@/lib/db";
import { cleanText } from "@/lib/clean";

// 업로드 직후 브라우저에서 뽑은 쪽별 본문을 받는다. 쪽 = 근거의 최소 단위.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { pages, page_count } = await req.json();
  if (!Array.isArray(pages)) return fail("pages 형식이 아니에요.");
  const sb = db();
  const rows = pages.map((p: any) => ({ book_id: params.id, page_no: Number(p.page_no), text: cleanText(p.text) }));
  const { error } = await sb.from("pages").upsert(rows, { onConflict: "book_id,page_no" });
  if (error) return fail(error.message, 500);
  if (page_count) await sb.from("books").update({ page_count }).eq("id", params.id);
  return json({ saved: rows.length });
}
