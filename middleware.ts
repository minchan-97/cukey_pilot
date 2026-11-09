import { NextResponse, type NextRequest } from "next/server";

// 파일럿 보호: 강사 교재가 들어가므로 링크만으로는 못 열게 기본 인증
export function middleware(req: NextRequest) {
  const pass = process.env.PILOT_PASSWORD;
  if (!pass) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, p] = atob(encoded).split(":");
    if (u === (process.env.PILOT_USER || "pilot") && p === pass) return NextResponse.next();
  }
  return new NextResponse("인증이 필요해요.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="imyong-d", charset="UTF-8"' },
  });
}

export const config = {
  // cron은 자체 비밀값으로, 서비스워커·매니페스트는 인증 없이 받아야 함
  matcher: ["/((?!api/cron|sw.js|pdf.worker.min.mjs|manifest.webmanifest|_next/static|_next/image|favicon.ico).*)"],
};
