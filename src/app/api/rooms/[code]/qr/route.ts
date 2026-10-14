import { connection } from "next/server";
import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { fail } from "@/lib/http";
import { getSnapshot } from "@/lib/rooms";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  await connection();
  try {
    const { code } = await params;
    const snapshot = getSnapshot(code);
    if (!snapshot) return new Response("ไม่พบ", { status: 404 });
    const link = `${request.nextUrl.origin}/r/${snapshot.room.code}`;
    const svg = await QRCode.toString(link, {
      type: "svg",
      margin: 1,
      width: 280,
      color: { dark: "#1c1b19", light: "#f6f5f2" },
    });
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
