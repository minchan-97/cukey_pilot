import { db, json, fail } from "@/lib/db";
import { weakList } from "@/lib/weaklist";

// 강사용: 개념별로 모아 '몇 명이 · 몇 번 표시 · 정답률'만. 개인은 드러나지 않는다.
export async function GET() {
  try {
    const all = await weakList(db(), null);
    const g = new Map<string, any>();
    for (const c of all as any[]) {
      const key = `${c.book_id}|${c.norm}`;
      const r = g.get(key) ?? { book: c.book_title, concept: c.name, users: new Set<string>(), marks: 0, correct: 0, total: 0 };
      r.users.add(c.user_id); r.marks += c.marks; r.correct += c.stat.correct; r.total += c.stat.total;
      g.set(key, r);
    }
    const rows = [...g.values()].map((r) => ({
      book: r.book, concept: r.concept, users: r.users.size, marks: r.marks,
      total: r.total, rate: r.total ? Math.round((r.correct / r.total) * 100) : null,
    })).sort((a, b) => b.users - a.users || b.marks - a.marks);
    return json(rows);
  } catch (e: any) {
    return fail(e.message, 500);
  }
}
