const TZ = "Asia/Karachi";

export function getTomorrowYmd(timeZone = TZ): string {
  const now = new Date();
  const inTz = new Date(now.toLocaleString("en-US", { timeZone }));
  inTz.setDate(inTz.getDate() + 1);
  const y = inTz.getFullYear();
  const m = String(inTz.getMonth() + 1).padStart(2, "0");
  const d = String(inTz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTodayYmd(timeZone = TZ): string {
  const inTz = new Date(new Date().toLocaleString("en-US", { timeZone }));
  const y = inTz.getFullYear();
  const m = String(inTz.getMonth() + 1).padStart(2, "0");
  const d = String(inTz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toYmdInTz(isoDate: string, timeZone = TZ): string {
  return new Date(isoDate).toLocaleDateString("en-CA", { timeZone });
}

export type HearingRow = {
  id: string;
  hearing_date: string;
  court_name?: string | null;
  cases?: { case_title?: string | null } | null;
};

export type TaskRow = {
  id: string;
  title: string;
  due_date?: string | null;
  is_completed?: boolean | null;
};

export function filterTomorrowHearings(hearings: HearingRow[], tomorrowYmd: string) {
  return hearings.filter((h) => toYmdInTz(h.hearing_date) === tomorrowYmd);
}

export function filterTomorrowTasks(tasks: TaskRow[], tomorrowYmd: string) {
  return tasks.filter(
    (t) => !t.is_completed && t.due_date && toYmdInTz(t.due_date) === tomorrowYmd
  );
}

export function buildTomorrowReminderPayload(
  hearings: HearingRow[],
  tasks: TaskRow[]
) {
  const tomorrowYmd = getTomorrowYmd();
  const tomorrowHearings = filterTomorrowHearings(hearings, tomorrowYmd);
  const tomorrowTasks = filterTomorrowTasks(tasks, tomorrowYmd);

  const caseNames = tomorrowHearings.map(
    (h) => h.cases?.case_title || "Unknown Case"
  );

  let body =
    "Hi Advocate NOOR SIAL tomorrow is your hearings in following cases";

  if (caseNames.length > 0) {
    body += ":\n" + caseNames.map((n) => `• ${n}`).join("\n");
  } else {
    body += ":\n(none scheduled)";
  }

  if (tomorrowTasks.length > 0) {
    body +=
      "\n\nTasks due tomorrow:\n" +
      tomorrowTasks.map((t) => `• ${t.title}`).join("\n");
  }

  return {
    title: "Al Noor Law — Tomorrow Reminder",
    body,
    tomorrowYmd,
    hasContent: caseNames.length > 0 || tomorrowTasks.length > 0,
    hearingCount: caseNames.length,
    taskCount: tomorrowTasks.length,
  };
}
