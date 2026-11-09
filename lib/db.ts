import { createClient } from "@supabase/supabase-js";

export function db() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// 파일럿은 사용자 한 명. Supabase Auth를 붙이면 여기만 바꾼다.
export const userId = () => process.env.DEMO_USER_ID || "pilot";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (message: string, status = 400) => Response.json({ error: message }, { status });
