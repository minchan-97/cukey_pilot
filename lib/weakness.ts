// v17 study_state(약점지도) + daily_digest(복습 간격·점수) 이식.
// 원칙: 자동 채점은 '제안', 성적에는 사람이 확정한 것만 들어간다.
export const INTERVALS = [1, 3, 7, 14, 30, 60]; // 복습 간격(일)
const DAY = 86_400_000;

export type Stat = {
  correct: number; total: number; streak: number;
  due_at: string; last_practiced: string | null;
};

export function scoreConcept(s: Stat, markCount: number, now = Date.now()) {
  const why: string[] = [];
  let score = Math.min(markCount, 5) * 0.4;
  if (markCount) why.push(`표시 ${markCount}번`);
  if (s.total === 0) {
    score += 1.0;
    why.push("아직 안 풀어봄");
  } else {
    const rate = s.correct / s.total;
    score += (1 - rate) * 2;
    why.push(`정답률 ${Math.round(rate * 100)}% (${s.correct}/${s.total})`);
  }
  const due = Date.parse(s.due_at);
  if (now >= due) {
    if (s.total > 0) {
      score += Math.min(2, 0.6 + ((now - due) / DAY) * 0.1);
      why.push("복습할 때");
    }
  } else {
    score -= 1.5; // 아직 이른 개념
  }
  return { score: Math.round(score * 100) / 100, why, due: now >= due };
}

/** 확정 판정 반영. 맞으면 간격을 늘리고, 틀리면 처음부터 다시. */
export function applyVerdict(s: Stat, verdict: "correct" | "wrong", now = Date.now()): Stat {
  const ok = verdict === "correct";
  const streak = ok ? Math.min(INTERVALS.length - 1, s.streak + 1) : 0;
  return {
    correct: s.correct + (ok ? 1 : 0),
    total: s.total + 1,
    streak,
    due_at: new Date(ok ? now + INTERVALS[streak] * DAY : now).toISOString(),
    last_practiced: new Date(now).toISOString(),
  };
}
