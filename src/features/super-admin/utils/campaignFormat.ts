import type { CampaignContact, CampaignStatus, FromNumber, VoicemailMode } from "@/features/super-admin/api/campaignsApi";

export type Tone = "success" | "info" | "warning" | "error" | "neutral";

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, Tone> = {
  draft: "neutral",
  running: "info",
  paused: "warning",
  completed: "success",
  cancelled: "error"
};

export const VOICEMAIL_MODES: Array<{ value: VoicemailMode; label: string; hint: string }> = [
  { value: "leave_message", label: "Leave the message on voicemail", hint: "Waits for the beep, then plays the recording. People who answer hear it after a 2–4 s pause." },
  { value: "hangup", label: "Hang up on voicemail", hint: "Only people who answer hear the recording." },
  { value: "no_detection", label: "No voicemail detection", hint: "Plays immediately on answer — fastest, but may start before a voicemail beep." }
];

export const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" }
];

export const TIMEZONES = [
  "America/St_Johns", "America/Halifax", "America/Toronto", "America/Winnipeg", "America/Regina",
  "America/Edmonton", "America/Vancouver", "America/New_York", "America/Chicago", "America/Denver",
  "America/Phoenix", "America/Los_Angeles", "Europe/London", "UTC"
];

export const CALL_OUTCOME_FILTERS = [
  { value: "", label: "All outcomes" },
  { value: "completed", label: "Completed" },
  { value: "no-answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Retry scheduled" },
  { value: "in-progress", label: "On call" },
  { value: "ringing", label: "Ringing" }
];

export const CONTACT_STATUS_FILTERS = [
  { value: "", label: "All contacts" },
  { value: "pending", label: "Waiting / retry" },
  { value: "completed", label: "Completed" },
  { value: "no-answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" }
];

export function callOutcome(contact: CampaignContact): { label: string; tone: Tone } {
  const answeredBy = contact.answered_by ?? "";
  switch (contact.call_status) {
    case "completed":
      if (answeredBy === "human") return { label: "Answered", tone: "success" };
      if (answeredBy.startsWith("machine")) return { label: "Voicemail", tone: "info" };
      if (answeredBy === "fax") return { label: "Fax machine", tone: "neutral" };
      return { label: "Completed", tone: "success" };
    case "pending":
      return contact.call_attempts > 0 ? { label: "Retry scheduled", tone: "warning" } : { label: "Waiting", tone: "neutral" };
    case "queued":
    case "initiated":
      return { label: "Dialing", tone: "info" };
    case "ringing":
      return { label: "Ringing", tone: "info" };
    case "in-progress":
      return { label: "On call", tone: "info" };
    case "busy":
      return { label: "Busy", tone: "warning" };
    case "no-answer":
      return { label: "No answer", tone: "warning" };
    case "failed":
      return { label: "Failed", tone: "error" };
    case "canceled":
      return { label: "Canceled", tone: "neutral" };
    case "skipped":
      return { label: "Skipped", tone: "neutral" };
    default:
      return { label: contact.call_status, tone: "neutral" };
  }
}

export function fmtDuration(seconds?: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

export function fmtTalkTime(seconds: number): string {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtDateTime(value?: string | null): string {
  return value
    ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

export function fmtBytes(bytes?: number | null): string {
  if (!bytes) return "—";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function hhmm(value?: string | null): string {
  return (value ?? "").slice(0, 5);
}

/** Human-readable reason for a skipped / failed contact. */
export function contactNote(contact: CampaignContact): string {
  if (contact.opted_out) return "Pressed the opt-out key";
  const error = contact.call_error ?? "";
  if (!error) return "";
  const retry = /^attempt (\d+): (.+)$/.exec(error);
  if (retry) return `Attempt ${retry[1]}: ${retry[2].replace("-", " ")}${contact.call_status === "pending" ? " — will retry" : ""}`;
  if (error === "no_phone") return "No phone number in sheet";
  if (error.startsWith("invalid_phone")) return `Invalid phone: ${error.split(": ")[1] ?? ""}`;
  if (error.startsWith("do_not_call")) return "Marked do-not-call in the sheet";
  if (error.startsWith("suppressed")) return "On the do-not-contact list";
  return error;
}

export function fromNumberLabel(n: Pick<FromNumber, "phone_number" | "is_default" | "assigned_to">): string {
  return `${n.phone_number}${n.is_default ? " (default)" : ""}${n.assigned_to ? ` — ${n.assigned_to}'s line` : ""}`;
}
