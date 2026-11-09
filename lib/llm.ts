// OpenAI 호출(v17과 같은 키·모델). JSON 한 덩어리만 받는다.
export async function llmJSON<T = any>(prompt: string, temperature = 0.4): Promise<T> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return JSON.parse(d.choices[0].message.content) as T;
}
