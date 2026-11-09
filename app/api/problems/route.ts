import { db, userId, json, fail } from "@/lib/db";
import { llmJSON } from "@/lib/llm";
import { gatherGrounding } from "@/lib/retrieve";
import { stemPrompt } from "@/lib/prompts";
import { checkCites, checkSupport, readable } from "@/lib/guard";
import { cleanText } from "@/lib/clean";

// 약한 개념 → 개념 문제 1개. 해설은 만들지 않는다(먼저 풀게).
export async function POST(req: Request) {
  const { concept_id } = await req.json();
  const sb = db();
  const user = userId();
  const { data: concept } = await sb.from("concepts")
    .select("id, name, book_id, books(title, subject)").eq("id", concept_id).eq("user_id", user).single();
  if (!concept) return fail("개념을 찾을 수 없어요.", 404);
  const book: any = concept.books;

  const { data: marks } = await sb.from("marks").select("page_no, text")
    .eq("concept_id", concept_id).order("created_at", { ascending: false }).limit(3);
  if (!marks?.length) return fail("이 개념에 표시한 부분이 없어요.");
  const { data: pages } = await sb.from("pages").select("page_no, text").eq("book_id", concept.book_id);

  const marked = marks.map((m) => m.text);
  // 저장된 본문도 읽을 때 한 번 더 정리(글자 밀림 복구) → 예전에 올린 교재도 살아난다
  const clean = (pages ?? []).map((p) => ({ page_no: p.page_no, text: cleanText(p.text) }));
  const grounding = gatherGrounding(`${concept.name} ${marked.join(" ")}`, marks[0].page_no, clean, book.title)
    .filter((g) => readable(g.text));
  if (!grounding.length) return fail("이 쪽 본문이 깨져 있어 근거로 쓸 수 없어요. 교재를 다시 올리거나 다른 쪽을 표시해 주세요.");

  // 근거 밖 인용이면 한 번 더, 그래도 안 되면 내지 않는다
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await llmJSON<{ stem: string; cites: string[] }>(stemPrompt(book.subject, concept.name, marked, grounding), 0.7);
    const chk = checkCites(r.cites, grounding);
    if (r.stem?.trim() && chk.ok && checkSupport(r.stem, grounding, 0.4).ok) {
      const ins = await sb.from("problems").insert({
        user_id: user, concept_id, stem: r.stem.trim(), grounding, stem_cites: chk.cites,
      }).select("id").single();
      if (ins.error) return fail(ins.error.message, 500);
      return json({ id: ins.data.id, stem: r.stem.trim() });
    }
  }
  return fail("근거 안에서 문제를 만들지 못했어요. 표시를 조금 넓혀 다시 시도해 주세요.", 422);
}
