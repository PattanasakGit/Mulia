import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="app">
      <main className="anteroom">
        <div className="anteroom-inner">
          <p className="eyebrow">Terms</p>
          <h1 className="display display-small">ข้อกำหนดการใช้ MULIA</h1>
          <p className="lede">
            หน้านี้เป็นตัวอย่างชั่วคราวสำหรับการตรวจสอบ UI การใช้งานจริงจะเพิ่มข้อกำหนดฉบับเต็มภายหลัง
          </p>
          <p className="lede">
            การใช้ MULIA หมายความว่าคุณตกลงที่จะผูกพันตาม{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
              YouTube Terms of Service
            </a>
            .
          </p>
          <Link className="btn btn-solid btn-block" href="/">
            กลับหน้าแรก
          </Link>
        </div>
      </main>
    </div>
  );
}
