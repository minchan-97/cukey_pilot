import { db, userId, json, fail } from "@/lib/db";

// 해설은 reveal 전엔 내려보내지 않는다
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { data: p } = await db().from("problems")
    .select("id, stem, grounding, answer, revealed_at, concept_id, concepts(name, book_id)")
    .eq("id", params.id).eq("user_id", userId()).single();
  if (!p) return fail("문제를 찾을 수 없어요.", 404);
  const c: any = p.concepts;
  const base = { id: p.id, stem: p.stem, concept: c?.name, book_id: c?.book_id, revealed: !!p.revealed_at };
  return json(p.revealed_at ? { ...base, answer: p.answer, grounding: p.grounding } : base);
}
