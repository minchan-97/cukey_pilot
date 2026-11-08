import { db, userId, json, fail } from "@/lib/db";
import { weakList } from "@/lib/weaklist";

export async function GET(req: Request) {
  const book = new URL(req.url).searchParams.get("book") ?? undefined;
  try {
    return json(await weakList(db(), userId(), book));
  } catch (e: any) {
    return fail(e.message, 500);
  }
}
