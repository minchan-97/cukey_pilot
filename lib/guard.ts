// 근거 검증 두 겹.
//  1) checkCites  — 인용한 쪽이 실제로 준 근거 안에 있는가
//  2) checkSupport — 글의 낱말이 실제로 근거 본문에 있는가
//     (인용 번호만 맞추고 내용은 지어내는 경우를 잡는다)
import type { Grounding } from "./retrieve";
import { tokenize } from "./tokenizer";

export function checkCites(cites: unknown, grounding: Grounding[]): { ok: boolean; cites: string[]; reason?: string } {
  const ids = new Set(grounding.map((g) => g.id));
  const list = Array.isArray(cites) ? cites.map(String) : [];
  if (list.length === 0) return { ok: false, cites: [], reason: "근거 표시 없음" };
  const outside = list.filter((c) => !ids.has(c));
  if (outside.length) return { ok: false, cites: list, reason: `근거 밖 인용: ${outside.join(", ")}` };
  return { ok: true, cites: [...new Set(list)] };
}

// 문장을 잇는 말·발문 상투어는 근거에 없어도 괜찮다
const GLUE = new Set(
  ("위해 위해서 위하여 또한 이러한 이런 그러한 예를 들어 들면 한다 있다 없다 통해 대해 따라 그리고 그러나 " +
   "설명 서술 쓰시오 설명하시오 서술하시오 무엇 어떤 어떻게 다음 경우 가지 각각 함께 중요 역할 " +
   "따른 관련 바탕 근거 내용 제시 측면 과정 방법 이유 의미 바탕으로 수험생").split(" ")
);

export function checkSupport(text: string, grounding: Grounding[], min = 0.6) {
  const ground = grounding.map((g) => g.text).join("\n");
  // [p14] 같은 근거 표시는 낱말이 아니므로 빼고 센다
  const words = [...new Set(tokenize(text.replace(/\[[^\]]*\]/g, " ")).filter((w) => w.length >= 2 && w !== "NUM" && !GLUE.has(w)))];
  if (!words.length) return { ok: false, ratio: 0, missing: [] as string[] };
  // 활용형 차이를 줄이려고 끝 한 글자는 비워 두고 찾는다
  const found = (w: string) => ground.includes(w.length > 2 ? w.slice(0, -1) : w);
  const missing = words.filter((w) => !found(w));
  const ratio = 1 - missing.length / words.length;
  return { ok: ratio >= min, ratio: Math.round(ratio * 100) / 100, missing };
}

/** 글자층이 깨져 사람이 못 읽는 근거는 빼야 한다 */
export function readable(text: string) {
  const chars = text.replace(/\s/g, "");
  if (chars.length < 20) return false;
  const hangul = (chars.match(/[가-힣]/g) ?? []).length;
  return hangul / chars.length >= 0.3;
}
