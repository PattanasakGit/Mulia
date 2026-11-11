import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="app">
      <main className="anteroom">
        <div className="anteroom-inner">
          <p className="eyebrow">Privacy</p>
          <h1 className="display display-small">นโยบายความเป็นส่วนตัว</h1>
          <p className="lede">
            หน้านี้เป็นตัวอย่างชั่วคราวสำหรับการตรวจสอบ UI MULIA ใช้ YouTube API Services
            และอาจใช้คุกกี้ตามที่ Google กำหนด
          </p>
          <p className="lede">
            ดูรายละเอียดเพิ่มเติมที่{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Google Privacy Policy
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
