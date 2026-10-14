import { Suspense } from "react";
import { RoomStage } from "@/components/room-stage";
import { Quiet } from "@/components/stage";

export default function Page() {
  return (
    <Suspense fallback={<Quiet label="กำลังเปิดห้อง" />}>
      <RoomStage />
    </Suspense>
  );
}
