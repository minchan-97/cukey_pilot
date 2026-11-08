import { db, json, fail } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = db();
  const { data: book, error } = await sb.from("books").select("*").eq("id", params.id).single();
  if (error || !book) return fail("교재를 찾을 수 없어요.", 404);
  const url = await sb.storage.from("books").createSignedUrl(book.storage_path, 3600);
  if (url.error) return fail(url.error.message, 500);
  return json({ ...book, fileUrl: url.data.signedUrl });
}
