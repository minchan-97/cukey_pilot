import { db, userId, json, fail } from "@/lib/db";
import { llmJSON } from "@/lib/llm";
import { conceptPrompt, normName } from "@/lib/prompts";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const book = u.searchParams.get("book");
  const page = Number(u.searchParams.get("page"));
  if (!book) return fail("book이 필요해요.");
  let q = db().from("marks").select("id, page_no, rects, text, concept_id, concepts(name)")
    .eq("user_id", userId()).eq("book_id", book);
  if (page) q = q.eq("page_no", page);
  const { data, error } = await q.order("created_at");
  return error ? fail(error.message, 500) : json(data);
}

// 드래그 표시 저장 → 개념 이름 붙이기(기존 이름 재사용 우선) → 약한 개념에 쌓기
export async function POST(req: Request) {
  const { book_id, page_no, rects, text } = await req.json();
  if (!text?.trim()) return fail("표시한 부분의 내용이 비어 있어요. 직접 적어 주세요.");
  const sb = db();
  const user = userId();

  const [{ data: book }, { data: page }, { data: existing }] = await Promise.all([
    sb.from("books").select("subject").eq("id", book_id).single(),
    sb.from("pages").select("text").eq("book_id", book_id).eq("page_no", page_no).maybeSingle(),
    sb.from("concepts").select("id, name, norm").eq("user_id", user).eq("book_id", book_id),
  ]);
  if (!book) return fail("교재를 찾을 수 없어요.", 404);

  let name = text.trim().slice(0, 15);
  try {
    const r = await llmJSON<{ concept: string }>(
      conceptPrompt(book.subject, text.trim(), (page?.text ?? "").slice(0, 800), (existing ?? []).map((c) => c.name)),
      0.1
    );
    if (r.concept?.trim()) name = r.concept.trim().slice(0, 30);
  } catch { /* LLM이 안 되면 표시 앞부분을 임시 이름으로 */ }

  const norm = normName(name);
  let concept = (existing ?? []).find((c) => c.norm === norm);
  if (!concept) {
    const ins = await sb.from("concepts").insert({ user_id: user, book_id, name, norm }).select("id, name, norm").single();
    if (ins.error) return fail(ins.error.message, 500);
    concept = ins.data;
    await sb.from("concept_stats").upsert({ concept_id: concept.id, user_id: user }, { onConflict: "concept_id", ignoreDuplicates: true });
  }

  const m = await sb.from("marks")
    .insert({ user_id: user, book_id, page_no, rects, text: text.trim(), concept_id: concept.id })
    .select("id, page_no, rects, text, concept_id").single();
  if (m.error) return fail(m.error.message, 500);
  return json({ mark: m.data, concept });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("id가 필요해요.");
  const { error } = await db().from("marks").delete().eq("id", id).eq("user_id", userId());
  return error ? fail(error.message, 500) : json({ deleted: id });
}
