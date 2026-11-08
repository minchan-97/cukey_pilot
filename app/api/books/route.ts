import { db, json, fail } from "@/lib/db";

export async function GET() {
  const { data, error } = await db().from("books").select("*").order("created_at", { ascending: false });
  return error ? fail(error.message, 500) : json(data);
}

// 교재 등록 → PDF는 브라우저가 Storage로 직접 올린다(Vercel 4.5MB 제한 회피)
export async function POST(req: Request) {
  const { title, subject } = await req.json();
  if (!title?.trim() || !subject?.trim()) return fail("교재명과 과목을 입력하세요.");
  const sb = db();
  const id = crypto.randomUUID();
  const storage_path = `${id}.pdf`;
  const { error } = await sb.from("books").insert({ id, title: title.trim(), subject: subject.trim(), storage_path });
  if (error) return fail(error.message, 500);
  const up = await sb.storage.from("books").createSignedUploadUrl(storage_path);
  if (up.error) return fail(up.error.message, 500);
  return json({ id, uploadUrl: up.data.signedUrl });
}
