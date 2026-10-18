"use client";

import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const timer = window.setTimeout(() => window.location.reload(), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <html lang="th">
      <body style={{ fontFamily: "serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <p>เชื่อมต่อสะดุด กำลังโหลดใหม่</p>
          <button type="button" onClick={() => retry()}>ลองอีกครั้ง</button>
        </div>
      </body>
    </html>
  );
}
