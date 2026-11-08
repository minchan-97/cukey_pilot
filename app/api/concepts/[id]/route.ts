import { db, userId, json, fail } from "@/lib/db";
import { normName } from "@/lib/prompts";

// 개념 이름은 AI 제안 → 내가 고칠 수 있다(v17 '사람이 확정' 원칙)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { name } = await req.json();
  if (!name?.trim()) return fail("이름을 입력하세요.");
  const { error } = await db().from("concepts")
    .update({ name: name.trim(), norm: normName(name) })
    .eq("id", params.id).eq("user_id", userId());
  if (error) return fail(error.code === "23505" ? "같은 이름의 개념이 이미 있어요." : error.message, 400);
  return json({ id: params.id, name: name.trim() });
}
