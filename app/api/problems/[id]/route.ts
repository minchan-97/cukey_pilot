import { db, userId, json, fail } from "@/lib/db";
import { llmJSON } from "@/lib/llm";
import { gatherGrounding, conceptGrounding, type Grounding } from "@/lib/retrieve";
import { blankPrompt, casePrompt, essayPrompt } from "@/lib/prompts";
import { checkCites, checkSupport, readable } from "@/lib/guard";
import { cleanText, looksBroken } from "@/lib/clean";
import { blankCandidates, expandPassage } from "@/lib/blanks";

export const maxDuration = 120;

const SYMBOLS = ["㉠", "㉡", "㉢", "㉣"];
const squash = (s: string) => s.replace(/[\s·.,'"‘’“”()<>]/g, "");
const groundText = (g: Grounding[]) => squash(g.map((x) => x.text).join(""));

/** 짧은 답(용어)은 근거에 글자 그대로, 긴 답(문장)은 낱말 60% 이상이 근거에 있어야 */
function grounded(answer: string, g: Grounding[]) {
  const a = squash(answer);
  if (a.length <= 15) return groundText(g).includes(a);
  return checkSupport(answer, g, 0.6).ok;
}

type Built = { stem: string; answer: { model_answer: string; explanation: string; cites: string[]; type: string } };

// ── 빈칸형: 제시문 = 드래그한 원문 그대로, 빈칸은 코드가 직접 뚫는다
async function buildBlank(subject: string, concept: string, passage: string, g: Grounding[]): Promise<Built | null> {
  const cands = blankCandidates(passage, concept, g.map((x) => x.text).join("\n")).map((c) => c.term);
  if (cands.length < 1) return null;
  const r = await llmJSON<any>(blankPrompt(subject, concept, passage, cands, g), 0.3);
  const sentences = passage.split(/(?<=[.?!다])\s+/);
  const maxBlanks = sentences.length >= 3 ? 3 : 2;
  const answers: string[] = (r.blanks ?? []).map((b: any) => String(b?.answer ?? "").trim())
    .filter((a: string) => cands.includes(a))                       // 후보 밖의 말은 버린다
    .filter((a: string, k: number, arr: string[]) => arr.indexOf(a) === k)
    .sort((a: string, b: string) => passage.indexOf(a) - passage.indexOf(b));  // 제시문 순서대로 ㉠, ㉡
  if (!answers.length) return null;
  const cites = checkCites(r.cites, g);
  if (!cites.ok) return null;

  // 원문에서 순서대로 찾아 ( ㉠ )로 바꾼다. 못 찾거나, 한 문장에 둘이 몰리면 실패
  let text = passage, from = 0;
  const used: string[] = [], sentOf: number[] = [];
  const sentenceAt = (pos: number) => {
    let acc = 0;
    for (const [k, sn] of sentences.entries()) { acc += sn.length + 1; if (pos < acc) return k; }
    return sentences.length - 1;
  };
  for (const a of answers) {
    if (used.length >= maxBlanks) break;
    const at = passage.indexOf(a, from);
    if (at < 0) continue;                                            // 앞 빈칸과 겹치면 건너뜀
    const k = sentenceAt(at);
    if (sentences.length > 1 && sentOf.includes(k)) continue;        // 같은 문장 두 번째 빈칸은 건너뜀
    sentOf.push(k); used.push(a); from = at + a.length;
  }
  if (!used.length) return null;
  // 뒤에서부터 바꿔야 앞쪽 위치가 안 밀린다
  const spots = used.map((a, i) => ({ a, i, at: -1 }));
  let cursor = 0;
  for (const sp of spots) { sp.at = passage.indexOf(sp.a, cursor); cursor = sp.at + sp.a.length; }
  for (const sp of [...spots].reverse()) text = text.slice(0, sp.at) + `( ${SYMBOLS[sp.i]} )` + text.slice(sp.at + sp.a.length);
  const n = used.length;
  const desc = String(r.source_desc ?? "").trim() || `${subject} 관련 자료`;
  const stem =
    `다음은 ${desc}의 일부이다. 물음에 답하시오. [${n}점]\n\n<자료>\n${text}\n\n` +
    used.map((_, i) => `${i + 1}) ${SYMBOLS[i]}에 들어갈 말을 쓰시오. [1점]`).join("\n");
  return {
    stem,
    answer: {
      model_answer: used.map((a, i) => `${i + 1}) ${SYMBOLS[i]} ${a}`).join("\n"),
      explanation: String(r.explanation ?? "").trim(),
      cites: cites.cites, type: "빈칸형",
    },
  };
}

// ── 사례형: 기호는 제시문 안에 반드시, 정답은 근거 안에 반드시
async function buildCase(subject: string, concept: string, marked: string[], g: Grounding[]): Promise<Built | null> {
  const r = await llmJSON<any>(casePrompt(subject, concept, marked, g), 0.6);
  const passage = String(r.passage ?? "").trim().replace(/^<\s*자료\s*>\s*/, "");
  const items = (r.items ?? []).map((it: any) => ({ ask: String(it?.ask ?? "").trim(), answer: String(it?.answer ?? "").trim() }))
    .filter((it: any) => it.ask && it.answer).slice(0, 3);
  if (!passage || items.length < 1) return null;
  if (/쓰시오|서술하시오|설명하시오/.test(passage)) return null;                // 질문이 제시문에 섞이면 안 됨
  for (const it of items) {
    const syms = it.ask.match(/[㉠-㉣]/g) ?? [];
    if (!syms.length || !syms.every((s: string) => passage.includes(s))) return null; // 가리키는 기호가 제시문에 있어야
    if (!/쓰시오\.?$/.test(it.ask)) return null;
    if (!grounded(it.answer, g)) return null;                                     // 정답은 근거 안에
  }
  const cites = checkCites(r.cites, g);
  if (!cites.ok) return null;
  const n = items.length;
  const lead = String(r.lead ?? "").trim().replace(/\s*\[\d+점\]\s*$/, "") || `다음은 ${subject} 수업 장면이다. 물음에 답하시오.`;
  const stem =
    `${lead} [${n}점]\n\n<자료>\n${passage}\n\n` +
    items.map((it: any, i: number) => `${i + 1}) ${it.ask.replace(/\s*\[\d+점\]\s*$/, "")} [1점]`).join("\n");
  return {
    stem,
    answer: {
      model_answer: items.map((it: any, i: number) => `${i + 1}) ${it.answer}`).join("\n"),
      explanation: String(r.explanation ?? "").trim(),
      cites: cites.cites, type: "사례형",
    },
  };
}

// 약한 개념 → 임용형 문항 1세트(빈칸형 또는 사례형). 정답은 함께 만들되 답을 내기 전엔 숨긴다.
export async function POST(req: Request) {
  const { concept_id, type } = await req.json();
  const kind: "blank" | "case" | "essay" = type === "case" ? "case" : type === "essay" ? "essay" : "blank";
  const sb = db();
  const user = userId();
  const { data: concept } = await sb.from("concepts")
    .select("id, name, book_id, books(title, subject)").eq("id", concept_id).eq("user_id", user).single();
  if (!concept) return fail("개념을 찾을 수 없어요.", 404);
  const book: any = concept.books;

  const { data: marks } = await sb.from("marks").select("page_no, text")
    .eq("concept_id", concept_id).order("created_at", { ascending: false }).limit(3);
  if (!marks?.length) return fail("이 개념에 표시한 부분이 없어요.");
  const { data: pages } = await sb.from("pages").select("page_no, text").eq("book_id", concept.book_id);

  const marked = marks.map((m) => cleanText(m.text));
  const clean = (pages ?? []).map((p) => ({ page_no: p.page_no, text: cleanText(p.text) }));

  // ── v17식 서술형: 개념 단위의 깨끗한 문장만 근거로, 자유롭게 출제. 해설은 답을 낸 뒤 검증하며 만든다
  if (kind === "essay") {
    let g = conceptGrounding(`${concept.name} ${marked.join(" ")}`, marks[0].page_no, clean, book.title,
      (s) => !looksBroken(s) && /[가-힣]/.test(s));
    if (!g.length) {                                               // 깨끗한 문장이 없으면 쪽 단위 근거로
      g = gatherGrounding(`${concept.name} ${marked.join(" ")}`, marks[0].page_no, clean, book.title).filter((x) => readable(x.text));
    }
    if (!g.length) return fail("이 쪽 본문이 깨져 있어 근거로 쓸 수 없어요. 다른 쪽을 표시해 주세요.");
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await llmJSON<{ stem: string }>(essayPrompt(book.subject, concept.name, marked, g), 0.7);
      const stem = String(r.stem ?? "").trim();
      if (!stem || /모범답안|정답\s*[:：]|해설\s*[:：]/.test(stem)) continue;
      const ins = await sb.from("problems").insert({
        user_id: user, concept_id, stem, grounding: g, stem_cites: g.map((x) => x.id),
      }).select("id").single();
      if (ins.error) return fail(ins.error.message, 500);
      return json({ id: ins.data.id, stem });
    }
    return fail("서술형 문제를 만들지 못했어요. 다시 눌러 주세요.", 422);
  }
  const grounding = gatherGrounding(`${concept.name} ${marked.join(" ")}`, marks[0].page_no, clean, book.title)
    .filter((g) => readable(g.text));
  if (!grounding.length) return fail("이 쪽 본문이 깨져 있어 근거로 쓸 수 없어요. 교재를 다시 올리거나 다른 쪽을 표시해 주세요.");

  // 표시가 짧으면 같은 쪽 원문에서 앞뒤 문장을 붙여 제시문을 만든다
  const pageText = clean.find((p) => p.page_no === marks[0].page_no)?.text ?? "";
  const passage = expandPassage(marked[0], pageText);
  if (kind === "blank" && passage.replace(/\s/g, "").length < 15) {
    return fail("이 쪽에서 빈칸형 제시문을 만들 원문이 부족해요. 사례형으로 만들어 보세요.");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const built = kind === "blank"
      ? await buildBlank(book.subject, concept.name, passage, grounding)
      : await buildCase(book.subject, concept.name, marked, grounding);
    if (!built) continue;
    const ins = await sb.from("problems").insert({
      user_id: user, concept_id, stem: built.stem, grounding, stem_cites: built.answer.cites, answer: built.answer,
    }).select("id").single();
    if (ins.error) return fail(ins.error.message, 500);
    return json({ id: ins.data.id, stem: built.stem });
  }
  return fail(kind === "blank"
    ? "표시한 원문에서 빈칸을 만들지 못했어요. 표시를 조금 넓혀 다시 시도해 주세요."
    : "근거 안에서 사례형 문항을 만들지 못했어요. 다시 눌러 보거나 빈칸형으로 만들어 보세요.", 422);
}
