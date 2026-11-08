import { db, json, fail } from "@/lib/db";
import { weakList } from "@/lib/weaklist";
import { sendPush } from "@/lib/push";

// pg_cron이 아침마다 부른다. 개념 고르기는 결정적(점수순), LLM 안 씀(v17 daily_digest 원칙).
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return fail("unauthorized", 401);
  const sb = db();
  const { data: subs } = await sb.from("push_subs").select("id, user_id, sub");
  const sent: any[] = [];
  for (const user of new Set<string>((subs ?? []).map((s: any) => s.user_id))) {
    const top = (await weakList(sb, user)).filter((c) => c.due).slice(0, 3);
    if (!top.length) continue;
    const payload = {
      title: "오늘의 약한 개념",
      body: top.map((c) => `${c.name} (${c.why[c.why.length - 1]})`).join("\n"),
      url: "/weak",
    };
    for (const s of (subs ?? []).filter((x) => x.user_id === user)) {
      try {
        await sendPush(s.sub, payload);
        sent.push({ user, concepts: top.map((c) => c.name) });
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) await sb.from("push_subs").delete().eq("id", s.id);
      }
    }
  }
  return json({ sent });
}
