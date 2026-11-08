import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR, Noto_Serif_KR } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = IBM_Plex_Sans_KR({ weight: ["400", "500", "600"], subsets: ["latin"], preload: false, variable: "--font-sans" });
const serif = Noto_Serif_KR({ weight: ["400", "600"], subsets: ["latin"], preload: false, variable: "--font-serif" });

export const metadata: Metadata = { title: "임용 D", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#22304A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <nav className="top">
          <Link href="/" className="brand">임용 D</Link>
          <Link href="/weak">약한 개념</Link>
          <Link href="/report">강사용</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
