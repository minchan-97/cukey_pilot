// 근거 검증 — LLM이 단 출처(cites)가 실제로 준 근거 안에 있는지 확인.
// 근거 밖을 인용하거나 아예 인용이 없으면 통과시키지 않는다.
import type { Grounding } from "./retrieve";

export function checkCites(cites: unknown, grounding: Grounding[]): { ok: boolean; cites: string[]; reason?: string } {
  const ids = new Set(grounding.map((g) => g.id));
  const list = Array.isArray(cites) ? cites.map(String) : [];
  if (list.length === 0) return { ok: false, cites: [], reason: "근거 표시 없음" };
  const outside = list.filter((c) => !ids.has(c));
  if (outside.length) return { ok: false, cites: list, reason: `근거 밖 인용: ${outside.join(", ")}` };
  return { ok: true, cites: [...new Set(list)] };
}
