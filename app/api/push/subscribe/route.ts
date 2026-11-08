import { db, userId, json, fail } from "@/lib/db";

export async function POST(req: Request) {
  const sub = await req.json();
  if (!sub?.endpoint) return fail("구독 정보가 없어요.");
  const { error } = await db().from("push_subs")
    .upsert({ user_id: userId(), endpoint: sub.endpoint, sub }, { onConflict: "endpoint" });
  return error ? fail(error.message, 500) : json({ ok: true });
}
