"use client";

import { useEffect } from "react";

const MAX_AUTO_RELOADS = 3;
const KEY = "mulia-error-reloads";

function reloadsSoFar() {
  try {
    return Number(window.sessionStorage.getItem(KEY)) || 0;
  } catch {
    return MAX_AUTO_RELOADS; // cannot count: do not auto-reload
  }
}

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const done = reloadsSoFar();
    if (done >= MAX_AUTO_RELOADS) return;
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(KEY, String(done + 1));
      } catch {
        /* not counted: the next load will not auto-reload */
      }
      window.location.reload();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <html lang="th">
      <body style={{ fontFamily: "serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div role="alert" style={{ textAlign: "center" }}>
          <p>เชื่อมต่อสะดุด กดลองอีกครั้งหรือรอสักครู่</p>
          <button type="button" onClick={() => retry()}>ลองอีกครั้ง</button>
        </div>
      </body>
    </html>
  );
}
