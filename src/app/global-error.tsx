"use client";

import { useEffect } from "react";
import { spendRetry, type RetryBudget } from "@/lib/retry-budget";

const MAX_AUTO_RELOADS = 3;
const KEY = "mulia-error-reloads";

function readBudget(): RetryBudget | null {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null");
    if (raw && Number.isFinite(raw.count) && Number.isFinite(raw.at)) return { count: raw.count, at: raw.at };
    return { count: 0, at: 0 };
  } catch {
    return null; // cannot count: do not auto-reload
  }
}

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const stored = readBudget();
    if (!stored) return;
    const spent = spendRetry(stored, Date.now(), MAX_AUTO_RELOADS);
    if (!spent.allowed) return;
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify(spent.next));
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
