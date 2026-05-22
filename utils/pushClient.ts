"use client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function enablePushNotifications(): Promise<{ ok: boolean; error?: string }> {
  if (!("Notification" in window) || !("PushManager" in window)) {
    return { ok: false, error: "Notifications not supported on this browser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission denied." };
  }

  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;

  const res = await fetch("/api/notifications/vapid");
  const { publicKey, error } = await res.json();
  if (!publicKey) return { ok: false, error: error || "VAPID key missing" };

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subJson = subscription.toJSON();
  const saveRes = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      userAgent: navigator.userAgent,
    }),
  });

  if (!saveRes.ok) {
    const data = await saveRes.json();
    return { ok: false, error: data.error || "Could not save subscription" };
  }

  localStorage.setItem("alnoor_push_enabled", "1");
  return { ok: true };
}

export async function sendTomorrowNotification(manual = true): Promise<{
  ok: boolean;
  error?: string;
  message?: string;
  preview?: string;
}> {
  const url = manual ? "/api/notifications/send" : "/api/notifications/send?auto=1";
  const res = await fetch(url, { method: "POST" });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { ok: false, error: data.error || data.message || "Send failed" };
  }
  if (data.skipped) {
    return { ok: true, message: data.reason === "already_sent_today" ? "Today's reminder already sent." : "Nothing scheduled for tomorrow." };
  }
  return { ok: true, message: `Sent to ${data.sent} device(s).`, preview: data.preview };
}

export function isPushEnabledLocally() {
  return localStorage.getItem("alnoor_push_enabled") === "1";
}

/** Reminders are sent daily at 6 PM PKT via Vercel Cron — see /api/notifications/cron */
