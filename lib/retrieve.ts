// v17 self_exam.retrieve(keyword 전략) + layer4.gather_grounding 이식.
// SOM 노드 대신 '표시한 쪽'을 닻으로 삼고, 같은 교재 안에서만 근거를 찾는다.
import { tokenize } from "./tokenizer";

const STOP = new Set(
  "학생 교사 지도 내용 활동 수업 학습 방법 경우 위해 대해 자료 단원 차시 교육 평가 성취 기준 있다 하는 것이 NUM".split(" ")
);

export type PageRow = { page_no: number; text: string };
export type Grounding = { id: string; page_no: number; source: string; text: string };

export function keywords(text: string, n = 12): string[] {
  const c = new Map<string, number>();
  for (const t of tokenize(text)) {
    if (t.length < 2 || STOP.has(t)) continue;
    c.set(t, (c.get(t) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/** 쪽 본문에서 낱말이 처음 걸리는 곳을 중심으로 잘라온다. */
export function excerpt(text: string, focus: string[], size = 900): string {
  const t = text.trim();
  if (t.length <= size) return t;
  let at = -1;
  for (const f of focus) {
    const i = t.indexOf(f);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - Math.floor(size / 3));
  return (start > 0 ? "…" : "") + t.slice(start, start + size) + (start + size < t.length ? "…" : "");
}

/**
 * 근거 모으기.
 *  1) 표시한 쪽(anchor)은 무조건 첫 근거
 *  2) 나머지는 표시 텍스트·개념명 낱말과 겹치는 쪽 (가까운 쪽 소폭 가산)
 * 출처는 항상 '교재명 p.쪽' — 출처 없는 근거는 만들 수 없다.
 */
export function gatherGrounding(
  query: string, anchorPage: number, pages: PageRow[], bookTitle: string, k = 4
): Grounding[] {
  const want = new Set(keywords(query));
  const focus = [...want];
  const make = (p: PageRow): Grounding => ({
    id: `p${p.page_no}`, page_no: p.page_no,
    source: `${bookTitle} p.${p.page_no}`, text: excerpt(p.text, focus),
  });
  const out: Grounding[] = [];
  const anchor = pages.find((p) => p.page_no === anchorPage);
  if (anchor && anchor.text.trim()) out.push(make(anchor));

  const scored = pages
    .filter((p) => p.page_no !== anchorPage && p.text.trim())
    .map((p) => {
      const have = new Set(keywords(p.text, 40));
      let s = 0;
      for (const w of want) if (have.has(w)) s += 1;
      if (s > 0 && Math.abs(p.page_no - anchorPage) <= 2) s += 0.5;
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  for (const { p } of scored.slice(0, k - out.length)) out.push(make(p));
  return out;
}

/**
 * v17 방식 근거: 쪽 통째가 아니라 '개념과 관련된 깨끗한 문장'만 짧게 모은다.
 * 표시한 쪽 문장에 가산점, 교재 전체에서 낱말이 겹치는 문장을 골라 쪽별로 묶는다.
 */
export function conceptGrounding(
  query: string, anchorPage: number, pages: PageRow[], bookTitle: string,
  ok: (s: string) => boolean, maxSentences = 6
): Grounding[] {
  const want = new Set(keywords(query, 16));
  const picked: { page_no: number; s: string; score: number; order: number }[] = [];
  let order = 0;
  for (const p of pages) {
    const sents = p.text.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/);
    for (const raw of sents) {
      const s = raw.trim();
      order++;
      if (s.length < 15 || s.length > 260 || !ok(s)) continue;
      const have = new Set(keywords(s, 30));
      let score = 0;
      for (const w of want) if (have.has(w)) score += 1;
      if (score === 0) continue;
      if (p.page_no === anchorPage) score += 1.5;
      else if (Math.abs(p.page_no - anchorPage) <= 2) score += 0.5;
      picked.push({ page_no: p.page_no, s, score, order });
    }
  }
  const top = picked.sort((a, b) => b.score - a.score).slice(0, maxSentences)
    .sort((a, b) => a.order - b.order);                     // 원문 순서대로 다시
  const byPage = new Map<number, string[]>();
  for (const t of top) byPage.set(t.page_no, [...(byPage.get(t.page_no) ?? []), t.s]);
  return [...byPage.entries()].map(([page_no, ss]) => ({
    id: `p${page_no}`, page_no, source: `${bookTitle} p.${page_no}`, text: ss.join(" "),
  }));
}
