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

const themeScript = `(function(){try{if(location.hostname==="127.0.0.1"){var id=localStorage.getItem("sound-index-identity")||"";var dest="http://localhost:"+(location.port||"80")+location.pathname+location.search+location.hash;if(id)dest+=(dest.indexOf("?")===-1?"?":"&")+"carry="+encodeURIComponent(id);location.replace(dest);return}var params=new URLSearchParams(location.search);var carry=params.get("carry");if(carry){var parsed=JSON.parse(carry);if(parsed&&typeof parsed.id==="string"&&typeof parsed.name==="string"&&parsed.name.length<=32)localStorage.setItem("sound-index-identity",JSON.stringify({id:parsed.id,name:parsed.name,hue:parsed.hue,emoji:parsed.emoji}));params.delete("carry");history.replaceState(null,"",location.pathname+(params.toString()?"?"+params.toString():"")+location.hash)}var t=localStorage.getItem("sound-index-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" data-theme="light" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{ fontFamily: "var(--font-display), \"Noto Serif Thai\", serif" }}>
        <Suspense fallback={<div className="app" />}>{children}</Suspense>
      </body>
    </html>
  );
}
