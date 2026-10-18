import Link from "next/link";
import { TopBar } from "@/components/top-bar";

export default function NotFound() {
  return (
    <div className="app">
      <TopBar />
      <main className="anteroom">
        <div className="anteroom-inner">
          <p className="eyebrow">404</p>
          <h1 className="display display-small">ไม่พบหน้านี้</h1>
          <p className="lede">ลิงก์อาจผิดหรือหน้านี้ไม่มีแล้ว</p>
          <Link className="btn btn-solid btn-block" href="/">
            กลับหน้าแรก
          </Link>
        </div>
      </main>
    </div>
  );
}
