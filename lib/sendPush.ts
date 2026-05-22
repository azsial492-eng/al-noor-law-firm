import webpush from "web-push";
import { getSupabaseAdmin } from "../utils/supabase-admin";
import {
  buildTomorrowReminderPayload,
  getTodayYmd,
  type HearingRow,
  type TaskRow,
} from "./tomorrowReminders";

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys missing. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env.local");
  }
  webpush.setVapidDetails("mailto:advocate@alnoorlaw.com", publicKey, privateKey);
}

export async function sendTomorrowReminders(options?: { auto?: boolean }) {
  configureWebPush();
  const admin = getSupabaseAdmin();
  const today = getTodayYmd();

  if (options?.auto) {
    const { data: log } = await admin
      .from("notification_log")
      .select("sent_date")
      .eq("sent_date", today)
      .maybeSingle();
    if (log) {
      return { ok: true, skipped: true, reason: "already_sent_today" };
    }
  }

  const { data: hearings } = await admin
    .from("hearings")
    .select("id, hearing_date, court_name, cases(case_title)");

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, due_date, is_completed");

  const payload = buildTomorrowReminderPayload(
    (hearings ?? []) as HearingRow[],
    (tasks ?? []) as TaskRow[]
  );

  if (options?.auto && !payload.hasContent) {
    return { ok: true, skipped: true, reason: "nothing_tomorrow" };
  }

  const { data: subs } = await admin.from("push_subscriptions").select("*");
  if (!subs?.length) {
    return { ok: false, error: "no_devices", message: "No devices registered. Enable notifications on each device first." };
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
  });

  let sent = 0;
  const staleEndpoints: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        pushPayload
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        staleEndpoints.push(sub.endpoint);
      }
    }
  }

  if (staleEndpoints.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  if (options?.auto && sent > 0) {
    await admin.from("notification_log").upsert({ sent_date: today }, { onConflict: "sent_date" });
  }

  return {
    ok: true,
    sent,
    totalDevices: subs.length,
    hearingCount: payload.hearingCount,
    taskCount: payload.taskCount,
    preview: payload.body,
  };
}
