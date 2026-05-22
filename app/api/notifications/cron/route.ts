import { NextResponse } from "next/server";
import { sendTomorrowReminders } from "@/lib/sendPush";

/**
 * Daily cron: 6:00 PM Pakistan (Asia/Karachi) = 13:00 UTC
 * Vercel runs this even when no user has the app open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendTomorrowReminders({ auto: true });
    return NextResponse.json({ ...result, scheduled: "daily_6pm_pkt" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cron send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
