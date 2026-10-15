import { Suspense } from "react";
import { RoomStage } from "@/components/room-stage";
import { Quiet } from "@/components/stage";

export default function Page({ params }: PageProps<"/r/[code]">) {
  return (
    <Suspense fallback={<Quiet label="กำลังเปิดห้อง" />}>
      <OpenedRoom params={params} />
    </Suspense>
  );
}

async function OpenedRoom({ params }: { params: PageProps<"/r/[code]">["params"] }) {
  const { code } = await params;
  return <RoomStage code={code} />;
}
