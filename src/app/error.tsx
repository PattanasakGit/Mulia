"use client";

import { useEffect } from "react";

export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const timer = window.setTimeout(retry, 3000);
    return () => window.clearTimeout(timer);
  }, [error, retry]);

  return (
    <main className="anteroom">
      <div className="anteroom-inner">
        <p className="eyebrow">เชื่อมต่อสะดุด</p>
        <h1 className="display display-small">กำลังต่อห้องให้ใหม่</h1>
        <button type="button" className="btn btn-solid btn-block" onClick={() => retry()}>
          ลองอีกครั้ง
        </button>
      </div>
    </main>
  );
}
