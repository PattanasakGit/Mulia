import { Suspense } from "react";
import { EnterForm } from "@/components/enter-form";
import { Quiet } from "@/components/stage";

export default function Page() {
  return (
    <Suspense fallback={<Quiet label="กำลังเปิด" />}>
      <EnterForm />
    </Suspense>
  );
}
