import { json, fail } from "@/lib/db";
import { cleanText } from "@/lib/clean";

// 글자층이 깨졌거나(글꼴 대응표 손상) 없을 때(스캔본) 이미지를 보고 글자를 읽는다. v17 page_scan 원칙 그대로.
// 글자가 빽빽한 쪽은 옮겨 적는 데만 1분 넘게 걸린다
export const maxDuration = 300;

const RULES =
  "요약·설명 금지. 적힌 글자를 그대로, 읽는 순서대로 옮긴다. 2단 편집은 왼쪽 단 다음 오른쪽 단.\n" +
  "표는 칸 사이를 ' | '로 구분하고 행마다 줄을 바꾼다. 수식은 a/b, x^2처럼 한 줄 글로 옮긴다.\n" +
  "안 보이는 글자는 추측하지 말고 [판독불가]로 둔다. JSON 하나만 출력: {\"text\": \"옮긴 글\"}";
const STRIPS = "이미지가 여러 장이면 한 장면을 위에서 아래로 자른 조각이다. 순서대로 이어 하나의 글로 옮기고, 조각 경계에서 겹친 글자는 한 번만 쓴다.\n";
const PROMPT = {
  region: "이 이미지는 한국 초등 임용시험 교재에서 수험생이 표시한 부분이다.\n" + STRIPS + RULES,
  page: "이 이미지는 한국 초등 임용시험 교재의 한 쪽이다. 쪽번호·머리글·바닥글은 빼고 본문만 옮긴다.\n" + STRIPS + RULES,
};

export async function POST(req: Request) {
  const body = await req.json();
  const mode = body.mode;
  const images: string[] = (Array.isArray(body.images) ? body.images : [body.image])
    .filter((x: unknown) => typeof x === "string" && x.startsWith("data:image/"))
    .slice(0, 8);
  if (!images.length) return fail("이미지가 없어요.");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // 판독 품질은 모델 영향이 크다. 환경변수로 상위 모델 지정 권장(예: gpt-4o)
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: mode === "page" ? PROMPT.page : PROMPT.region },
        ...images.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
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
