import { ApiError } from "@/lib/client";
import { MEMBERS_LIMIT, NAME_MAX } from "@/lib/limits";

/** Thai copy per UXUI (MULIA-BUGHUNT-02-FIX-B3). Null = nothing worth telling the user. */
export function joinErrorMessage(caught: unknown) {
  if (caught instanceof ApiError) {
    if (caught.status === 403) return `ห้องนี้เต็มแล้ว (ครบ ${MEMBERS_LIMIT} คน) ลองใหม่ภายหลัง หรือขอลิงก์ห้องอื่นจากเจ้าของห้อง`;
    if (caught.status === 400) return `ชื่อไม่ถูกต้อง ใช้ 1–${NAME_MAX} ตัวอักษร แล้วเปลี่ยนชื่อที่หน้าตั้งชื่อ`;
    if (caught.status === 404) return null; // the poll shows the closed-room screen
  }
  return "เข้าห้องไม่สำเร็จ ลองใหม่อีกครั้ง";
}
