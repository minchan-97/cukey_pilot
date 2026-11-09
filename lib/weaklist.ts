// 약한 개념 목록 = 개념 + 성적 + 표시 수 + 점수. 화면·알림·강사 보기가 같이 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreConcept, type Stat } from "./weakness";

export type WeakItem = {
  id: string; name: string; book_id: string; book_title: string;
  marks: number; stat: Stat; score: number; why: string[]; due: boolean;
};

const EMPTY: Stat = { correct: 0, total: 0, streak: 0, due_at: new Date(0).toISOString(), last_practiced: null };

export async function weakList(sb: SupabaseClient, user: string | null, bookId?: string) {
  let q = sb.from("concepts")
    .select("id, name, norm, user_id, book_id, books(title), concept_stats(*), marks(count)");
  if (user) q = q.eq("user_id", user);
  if (bookId) q = q.eq("book_id", bookId);
  const { data, error } = await q;
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).map((c: any) => {
    const st = (Array.isArray(c.concept_stats) ? c.concept_stats[0] : c.concept_stats) ?? EMPTY;
    const marks = c.marks?.[0]?.count ?? 0;
    const s = scoreConcept(st, marks, now);
    return {
      id: c.id, name: c.name, norm: c.norm, user_id: c.user_id,
      book_id: c.book_id, book_title: c.books?.title ?? "",
      marks, stat: st, ...s,
    };
  }).sort((a, b) => b.score - a.score);
}
