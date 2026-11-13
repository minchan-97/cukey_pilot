import { db, userId, json, fail } from "@/lib/db";
import { llmJSON } from "@/lib/llm";
import { gatherGrounding, type Grounding } from "@/lib/retrieve";
import { imyongPrompt } from "@/lib/prompts";
import { checkCites, checkSupport, readable } from "@/lib/guard";
import { cleanText } from "@/lib/clean";

type Item = { no: number | string; ask: string; answer: string; cites?: string[] };
type Gen = { type?: string; lead?: string; passage?: string; items?: Item[]; explanation?: string; cites?: string[] };

const squash = (s: string) => s.replace(/[\s·.,'"‘’“”()]/g, "");

/** 생성 결과 검사: 형식, 인용, 근거 일치. 빈칸형은 정답이 원문에 글자 그대로 있어야 한다. */
function validate(r: Gen, grounding: Grounding[]) {
  const items = (r.items ?? []).filter((it) => it?.ask?.trim() && it?.answer?.trim());
  if (!r.passage?.trim() || items.length < 1 || items.length > 4) return null;
  const cites = checkCites([...(r.cites ?? []), ...items.flatMap((it) => it.cites ?? [])], grounding);
  if (!cites.ok) return null;
  if (!checkSupport(`${items.map((it) => it.answer).join(" ")} ${r.explanation ?? ""}`, grounding).ok) return null;
  if (r.type?.includes("빈칸")) {
    const ground = squash(grounding.map((g) => g.text).join(""));
    if (!items.every((it) => ground.includes(squash(it.answer)))) return null;
  }
  return { items, cites: cites.cites };
}

// 약한 개념 → 임용형 서답형 문항 1세트. 정답은 함께 만들어 두되 답을 내기 전엔 숨긴다.
export async function POST(req: Request) {
  const { concept_id } = await req.json();
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

  const marked = marks.map((m) => m.text);
  // 저장된 본문도 읽을 때 한 번 더 정리(글자 밀림 복구) → 예전에 올린 교재도 살아난다
  const clean = (pages ?? []).map((p) => ({ page_no: p.page_no, text: cleanText(p.text) }));
  const grounding = gatherGrounding(`${concept.name} ${marked.join(" ")}`, marks[0].page_no, clean, book.title)
    .filter((g) => readable(g.text));
  if (!grounding.length) return fail("이 쪽 본문이 깨져 있어 근거로 쓸 수 없어요. 교재를 다시 올리거나 다른 쪽을 표시해 주세요.");

  // 검사를 못 넘으면 한 번 더, 그래도 안 되면 내지 않는다
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await llmJSON<Gen>(imyongPrompt(book.subject, concept.name, marked, grounding), 0.5);
    const ok = validate(r, grounding);
    if (!ok) continue;
    const passage = r.passage!.trim().replace(/^<\s*자료\s*>\s*/, "");
    const stem =
      `${(r.lead ?? "다음 자료를 읽고 물음에 답하시오.").trim()}\n\n<자료>\n${passage}\n\n` +
      ok.items.map((it, i) => `${i + 1}) ${it.ask.trim()}`).join("\n");
    const answer = {
      model_answer: ok.items.map((it, i) => `${i + 1}) ${it.answer.trim()}`).join("\n"),
      explanation: (r.explanation ?? "").trim(),
      cites: ok.cites,
      type: r.type ?? "",
    };
    const ins = await sb.from("problems").insert({
      user_id: user, concept_id, stem, grounding, stem_cites: ok.cites, answer,
    }).select("id").single();
    if (ins.error) return fail(ins.error.message, 500);
    return json({ id: ins.data.id, stem });
  }
  return fail("근거 안에서 임용형 문항을 만들지 못했어요. 표시를 조금 넓혀 다시 시도해 주세요.", 422);
}
