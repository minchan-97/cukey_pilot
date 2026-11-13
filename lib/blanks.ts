// 빈칸 후보 고르기 — 임용 교육과정 빈칸은 대개 '개념어'다.
// AI에게 아무 말이나 고르게 두지 않고, 코드가 개념어 후보를 먼저 추려 그 안에서만 고르게 한다.

// 개념어에 자주 붙는 끝말 (범주화, 타당성, 문제 해결력, 의사소통 능력, 추론 과정 …)
const CONCEPT_END = /(성|력|화|법|론|원리|능력|태도|가치|기능|과정|맥락|전략|요소|개념|구조|관계|활동|역량|사고|방법|체계|원칙|규칙|양식|단계|기준|영역|감각|이해|표현|탐구|추론|해결|공동체|정체성)$/;
const STOP = new Set(("여러 가지 모양 다양 다양한 우리 학생 교사 자신 하나 이것 그것 사람 경우 때문 정도 부분 내용 " +
  "모든 각각 등 및 또는 그리고 통해 대한 위한 위해 같은 이러한 이를 것 수 있다 있는 없는 된다 한다 하는").split(" "));
const VERBISH = /(하다|하고|하며|하여|해서|한다|된다|되며|되고|되어|있다|없다|이다|하는|되는|있는|없는|했다|였다|으로써|함으로써|하기|되기|한|된|할|될)$/;

export type Candidate = { term: string; score: number };

// 명사 뒤 '하다/되다' 꼴(범주화한, 정당화하는) → 앞의 명사는 살린다
const LIGHT = ["함으로써", "됨으로써", "하거나", "되거나", "하도록", "되도록", "하여야", "하면", "되면", "하는", "하고", "하며", "하여", "해서", "하기", "하게", "하지", "한다", "되는", "되고", "되며", "되어", "돼서",
  "되기", "되게", "되지", "된다", "함", "한", "할", "됨", "된", "될"].sort((a, b) => b.length - a.length);
// 그 밖의 서술어 끝 → 동사·형용사라 빈칸 후보에서 뺀다
const PRED = ["는다", "있다", "없다", "으며", "적으로", "히는", "히고", "히며", "히여", "리는", "기는", "우는", "다"];
const JOSA = ["으로써", "으로서", "에서는", "에서도", "에게는", "이라는", "으로는", "에서", "에게", "으로", "로서", "로써",
  "까지", "부터", "처럼", "보다", "이며", "이고", "와의", "과의", "라는", "이다", "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로", "며"]
  .sort((a, b) => b.length - a.length);

/** 어절 → [명사 줄기, 조사·어미가 붙어 있었는지]. 동사·형용사면 null */
function nounStem(w: string): [string, boolean] | null {
  for (const e of LIGHT) if (w.endsWith(e) && w.length - e.length >= 2) return [w.slice(0, -e.length), true];
  for (const e of PRED) if (w.endsWith(e)) return null;
  for (const j of JOSA) if (w.endsWith(j)) return w.length - j.length >= 2 ? [w.slice(0, -j.length), true] : null;
  return w.length >= 2 ? [w, false] : null;
}

/** 제시문에서 개념어 후보를 뽑아 점수순으로. term은 제시문에 글자 그대로 있다. */
export function blankCandidates(passage: string, concept: string, ground: string, limit = 14): Candidate[] {
  const words = passage.split(/\s+/).map((w) => w.replace(/^[^가-힣A-Za-z0-9'‘“"]+|[^가-힣A-Za-z0-9'’”"]+$/g, "")).filter(Boolean);
  const stems = words.map(nounStem);
  const pool = new Map<string, number>();
  const add = (term: string, base: number) => {
    term = term.trim();
    if (term.length < 2 || term.length > 12 || STOP.has(term) || VERBISH.test(term)) return;
    if (!/[가-힣]/.test(term) || !passage.includes(term)) return;
    let s = base;
    if (CONCEPT_END.test(term)) s += 2;
    if (term.length >= 3 && term.length <= 8) s += 1;
    if (concept.replace(/\s/g, "").includes(term.replace(/\s/g, ""))) s += 2;
    const reps = ground.split(term).length - 1;        // 근거 여러 곳에 나오는 핵심어
    if (reps >= 2) s += 1;
    pool.set(term, Math.max(pool.get(term) ?? 0, s));
  };
  // 따옴표로 강조된 말은 거의 확실한 개념어
  for (const m of passage.matchAll(/['‘“"]([^'’”"]{2,12})['’”"]/g)) add(m[1], 3);
  stems.forEach((st, i) => {
    if (!st) return;
    const [t, attached] = st;
    add(t, 0);
    // 두 어절 개념어: '상황 맥락', '쓰기 전략', '비판적 사고' (앞 어절에 조사가 없을 때만)
    const nx = stems[i + 1];
    if (!attached && nx && !STOP.has(t)) add(`${t} ${nx[0]}`, CONCEPT_END.test(nx[0]) ? 1 : -1);
  });
  return [...pool.entries()].map(([term, score]) => ({ term, score }))
    .sort((a, b) => b.score - a.score || b.term.length - a.term.length).slice(0, limit);
}

/**
 * 표시한 부분이 짧으면 같은 쪽 원문에서 앞뒤 문장을 붙여 제시문을 넉넉하게 만든다.
 * 표시한 글이 원문에서 안 찾아지면(이미지 판독 등) 낱말이 가장 많이 겹치는 문장을 중심으로 잡는다.
 */
export function expandPassage(marked: string, pageText: string, minLen = 90, maxLen = 420): string {
  const one = (s: string) => s.replace(/\s+/g, " ").trim();
  const mark = one(marked);
  const page = one(pageText);
  if (!page || mark.length >= minLen) return mark;
  const sents = page.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter((s) => s.length > 4);
  if (!sents.length) return mark;

  // 표시한 글이 걸친 문장들 찾기
  const at = page.indexOf(mark);
  let lo = -1, hi = -1;
  if (at >= 0) {
    let pos = 0;
    sents.forEach((s, k) => {
      const start = page.indexOf(s, pos), end = start + s.length;
      pos = end;
      if (end > at && start < at + mark.length) { if (lo < 0) lo = k; hi = k; }
    });
  }
  if (lo < 0) {
    // 못 찾으면 겹치는 낱말이 가장 많은 문장
    const want = new Set(mark.split(" ").filter((w) => w.length >= 2));
    let best = -1, bestScore = 0;
    sents.forEach((s, k) => {
      const sc = s.split(" ").filter((w) => want.has(w)).length;
      if (sc > bestScore) { best = k; bestScore = sc; }
    });
    if (best < 0) return mark;
    lo = hi = best;
  }
  // 짧으면 뒤 문장 → 앞 문장 순으로 붙인다
  const len = () => sents.slice(lo, hi + 1).join(" ").length;
  while (len() < minLen) {
    if (hi + 1 < sents.length && len() + sents[hi + 1].length <= maxLen) hi++;
    else if (lo > 0 && len() + sents[lo - 1].length <= maxLen) lo--;
    else break;
  }
  return sents.slice(lo, hi + 1).join(" ");
}
