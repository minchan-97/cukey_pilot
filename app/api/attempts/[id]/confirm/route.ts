import { db, userId, json, fail } from "@/lib/db";
import { applyVerdict, type Stat } from "@/lib/weakness";

// 내 확정만 성적·복습 간격에 반영(v17 TRUST_HUMAN 원칙)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { verdict } = await req.json();
  if (verdict !== "correct" && verdict !== "wrong") return fail("맞음/틀림 중 하나를 고르세요.");
  const sb = db();
  const user = userId();
  const { data: a } = await sb.from("attempts")
    .select("id, final_verdict, problems(concept_id)").eq("id", params.id).eq("user_id", user).single();
  if (!a) return fail("풀이를 찾을 수 없어요.", 404);
  if (a.final_verdict) return fail("이미 확정한 풀이예요.", 409);
  const concept_id = (a.problems as any).concept_id;

  const { data: st } = await sb.from("concept_stats").select("*").eq("concept_id", concept_id).single();
  const next = applyVerdict((st ?? { correct: 0, total: 0, streak: 0, due_at: new Date().toISOString(), last_practiced: null }) as Stat, verdict);
  await sb.from("attempts").update({ final_verdict: verdict }).eq("id", a.id);
  const { error } = await sb.from("concept_stats").upsert({ concept_id, user_id: user, ...next }, { onConflict: "concept_id" });
  return error ? fail(error.message, 500) : json(next);
}
