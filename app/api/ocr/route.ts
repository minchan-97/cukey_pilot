import { json, fail } from "@/lib/db";
import { cleanText } from "@/lib/clean";

// 글자층이 깨졌거나(글꼴 대응표 손상) 없을 때(스캔본) 이미지를 보고 글자를 읽는다. v17 page_scan 원칙 그대로.
export const maxDuration = 60;

const RULES =
  "요약·설명 금지. 적힌 글자를 그대로, 읽는 순서대로 옮긴다. 2단 편집은 왼쪽 단 다음 오른쪽 단.\n" +
  "표는 칸 사이를 ' | '로 구분하고 행마다 줄을 바꾼다. 수식은 a/b, x^2처럼 한 줄 글로 옮긴다.\n" +
  "안 보이는 글자는 추측하지 말고 [판독불가]로 둔다. JSON 하나만 출력: {\"text\": \"옮긴 글\"}";
const PROMPT = {
  region: "이 이미지는 한국 초등 임용시험 교재의 일부를 잘라낸 것이다.\n" + RULES,
  page: "이 이미지는 한국 초등 임용시험 교재의 한 쪽이다. 쪽번호·머리글·바닥글은 빼고 본문만 옮긴다.\n" + RULES,
};

export async function POST(req: Request) {
  const { image, mode } = await req.json();
  if (typeof image !== "string" || !image.startsWith("data:image/")) return fail("이미지가 없어요.");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: mode === "page" ? PROMPT.page : PROMPT.region },
        { type: "image_url", image_url: { url: image, detail: "high" } },
      ] }],
    }),
  });
  if (!r.ok) return fail(`글자 읽기 실패 (${r.status})`, 502);
  try {
    const d = await r.json();
    return json({ text: cleanText(JSON.parse(d.choices[0].message.content).text) });
  } catch {
    return fail("글자 읽기 결과를 해석하지 못했어요.", 502);
  }
}
