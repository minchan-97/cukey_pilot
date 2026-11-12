import { db, json, fail } from "@/lib/db";

async function stored(sb: ReturnType<typeof db>, path: string) {
  const { data } = await sb.storage.from("books").list("", { search: path });
  return !!data?.some((o) => o.name === path);
}

// ?check=1 → PDF가 저장소에 실제로 들어갔는지만 확인
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const sb = db();
  const { data: book, error } = await sb.from("books").select("*").eq("id", params.id).single();
  if (error || !book) return fail("교재를 찾을 수 없어요.", 404);
  if (new URL(req.url).searchParams.get("check")) return json({ exists: await stored(sb, book.storage_path) });
  const url = await sb.storage.from("books").createSignedUrl(book.storage_path, 3600);
  if (url.error) return fail(`저장소에 PDF 파일이 없어요. 교재를 지우고 다시 올려 주세요. (${url.error.message})`, 404);
  return json({ ...book, fileUrl: url.data.signedUrl });
}

// 교재 지우기: PDF 파일 + 교재 줄(쪽 본문·표시·개념은 함께 지워짐)
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const sb = db();
  const { data: book } = await sb.from("books").select("storage_path").eq("id", params.id).single();
  if (book) await sb.storage.from("books").remove([book.storage_path]);
  const { error } = await sb.from("books").delete().eq("id", params.id);
  return error ? fail(error.message, 500) : json({ deleted: params.id });
}
