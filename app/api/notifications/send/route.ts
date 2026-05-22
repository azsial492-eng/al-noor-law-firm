import { NextResponse } from "next/server";
import { sendTomorrowReminders } from "@/lib/sendPush";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const auto = searchParams.get("auto") === "1";
    const result = await sendTomorrowReminders({ auto });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
