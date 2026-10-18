import { CurtainProvider } from "@/components/curtain";
import { MotionRoot } from "@/components/motion";
import { themeScript } from "@/lib/theme-script";
import type { Metadata } from "next";
import { Noto_Serif_Thai } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

const display = Noto_Serif_Thai({
  subsets: ["thai", "latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MULIA",
  description: "MULIA บัญชีห้องฟังเพลงร่วมกัน เลือกเข้า ฟังไปด้วยกัน และตั้งใจกับเสียง",
};


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" data-theme="light" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{ fontFamily: "var(--font-display), \"Noto Serif Thai\", serif" }}>
        <MotionRoot>
          <CurtainProvider>
            <Suspense fallback={<div className="app" />}>{children}</Suspense>
          </CurtainProvider>
        </MotionRoot>
      </body>
    </html>
  );
}
