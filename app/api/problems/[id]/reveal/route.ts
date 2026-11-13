import { db, userId, json, fail } from "@/lib/db";
import { llmJSON } from "@/lib/llm";
import { answerPrompt, gradePrompt } from "@/lib/prompts";
import { checkCites, checkSupport } from "@/lib/guard";
import type { Grounding } from "@/lib/retrieve";

// 내 답을 내야만 해설이 열린다(인출연습 강제). 해설 생성 → 채점 '제안'까지.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { my_answer } = await req.json();
  if (!my_answer?.trim()) return fail("먼저 내 답을 적어 주세요.");
  const sb = db();
  const user = userId();
  const { data: p } = await sb.from("problems")
    .select("id, stem, grounding, answer, revealed_at, concepts(books(subject))")
    .eq("id", params.id).eq("user_id", user).single();
  if (!p) return fail("문제를 찾을 수 없어요.", 404);
  const subject = (p.concepts as any)?.books?.subject ?? "";
  const grounding = p.grounding as Grounding[];

  let answer = p.answer as any;
  // 임용형 문항은 정답을 미리 만들어 둔다 → 지금 처음 여는 것으로 기록만
  if (answer && !p.revealed_at) {
    await sb.from("problems").update({ revealed_at: new Date().toISOString() }).eq("id", p.id);
  }
  if (!answer) {
    for (let i = 0; i < 3 && !answer; i++) {
      const r = await llmJSON<any>(answerPrompt(subject, p.stem, grounding), 0.2);
      // 인용을 빼먹으면 준 근거 전체로 본다(근거 밖 인용은 여전히 거부)
      const chk = checkCites(Array.isArray(r.cites) && r.cites.length ? r.cites : grounding.map((g) => g.id), grounding);
      // 해설이 문제 속 상황(교사·학생 장면 등)을 다시 말하는 건 지어낸 게 아니므로 발문도 함께 대조
      const sup = checkSupport(`${r.model_answer ?? ""} ${r.explanation ?? ""}`, grounding, 0.6, p.stem);
      if (chk.ok && sup.ok && r.model_answer) answer = { model_answer: r.model_answer, explanation: r.explanation ?? "", cites: chk.cites };
    }
    if (!answer) return fail("근거에 없는 내용이 섞여 해설을 내지 않았어요. 다시 눌러 보고, 계속 안 되면 새 문제를 만들어 주세요.", 422);
    await sb.from("problems").update({ answer, revealed_at: new Date().toISOString() }).eq("id", p.id);
  }

  let suggest: any = null;
  try {
    suggest = await llmJSON(gradePrompt(subject, p.stem, my_answer.trim(), answer.model_answer, grounding), 0.2);
  } catch { /* 제안이 없어도 내가 확정하면 된다 */ }

  const at = await sb.from("attempts")
    .insert({ problem_id: p.id, user_id: user, my_answer: my_answer.trim(), auto_suggest: suggest })
    .select("id").single();
  if (at.error) return fail(at.error.message, 500);
  return json({ answer, grounding, suggest, attempt_id: at.data.id });
}
