"use client";

import { useEffect } from "react";

// Automatic retries stop after a few tries (per page load) so a broken route cannot loop forever.
const MAX_AUTO_RETRIES = 3;
let autoRetries = 0;

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    if (autoRetries >= MAX_AUTO_RETRIES) return;
    autoRetries += 1;
    const timer = window.setTimeout(retry, 3000);
    return () => window.clearTimeout(timer);
  }, [error, retry]);

  return (
    <main className="anteroom">
      <div className="anteroom-inner" role="alert">
        <p className="eyebrow">เชื่อมต่อสะดุด</p>
        <h1 className="display display-small">
          {autoRetries >= MAX_AUTO_RETRIES ? "ยังต่อห้องไม่ได้" : "กำลังต่อห้องให้ใหม่"}
        </h1>
        <button type="button" className="btn btn-solid btn-block" onClick={() => retry()}>
          ลองอีกครั้ง
        </button>
      </div>
    </main>
  );
}
