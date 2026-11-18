import { ApiError, request } from "@/shared/api/httpClient";
import { appConfig } from "@/shared/config/appConfig";
import { authSession } from "@/shared/session/authSession";
import type { Pagination } from "@/features/super-admin/api/superAdminApi";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampaignStatus = "draft" | "running" | "paused" | "completed" | "cancelled";
export type CallStatus =
  | "pending" | "queued" | "initiated" | "ringing" | "in-progress"
  | "completed" | "busy" | "no-answer" | "failed" | "canceled" | "skipped";
export type EmailStatus = "pending" | "sending" | "sent" | "failed" | "skipped";
export type VoicemailMode = "leave_message" | "hangup" | "no_detection";

export type CampaignStats = {
  contacts: number;
  progress_percent: number;
  calls: {
    by_status: Partial<Record<CallStatus, number>>;
    remaining: number;
    in_progress: number;
    answered_by_person: number;
    voicemail: number;
    opted_out: number;
  };
  emails: {
    by_status: Partial<Record<EmailStatus, number>>;
    sent: number;
    remaining: number;
  };
};

export type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  call_enabled: boolean;
  from_number: string | null;
  has_audio: boolean;
  audio_file_name: string | null;
  audio_content_type: string | null;
  audio_size_bytes: number | null;
  voicemail_mode: VoicemailMode;
  opt_out_enabled: boolean;
  opt_out_digit: string;
  max_call_attempts: number;
  retry_delay_minutes: number;
  max_concurrent_calls: number;
  ring_timeout_seconds: number;
  call_window_start: string;
  call_window_end: string;
  call_days: number[];
  timezone: string | null;
  email_enabled: boolean;
  email_subject: string | null;
  email_body_html: string | null;
  email_body_text: string | null;
  email_from_name: string | null;
  email_reply_to: string | null;
  start_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  last_error: string | null;
  total_contacts: number;
  in_call_window_now: boolean | null;
  created_at: string;
  updated_at: string;
  stats?: CampaignStats;
};

export type CampaignSettings = Partial<Pick<Campaign,
  | "name" | "description" | "call_enabled" | "from_number" | "voicemail_mode" | "opt_out_enabled"
  | "opt_out_digit" | "max_call_attempts" | "retry_delay_minutes" | "max_concurrent_calls"
  | "ring_timeout_seconds" | "call_window_start" | "call_window_end" | "call_days" | "timezone"
  | "email_enabled" | "email_subject" | "email_body_html" | "email_body_text" | "email_from_name" | "email_reply_to"
>>;

export type EmailTemplate = {
  id: string;
  name: string;
  description: string;
  from_name: string;
  subject: string;
  body_html: string;
  body_text: string;
};

export type CampaignContact = {
  id: string;
  campaign_id: string;
  campaign_name?: string | null;
  row_number: number | null;
  business_name: string | null;
  contact_name: string | null;
  phone_number: string | null;
  phone_raw: string | null;
  email: string | null;
  extra: Record<string, string>;
  call_status: CallStatus;
  call_attempts: number;
  call_next_attempt_at: string | null;
  call_last_attempt_at: string | null;
  call_sid: string | null;
  answered_by: string | null;
  call_duration_seconds: number | null;
  call_error: string | null;
  opted_out: boolean;
  email_status: EmailStatus;
  email_sent_at: string | null;
  email_error: string | null;
};

export type ImportPreview = {
  dry_run: boolean;
  default_country: string;
  columns: Partial<Record<"business_name" | "contact_name" | "phone" | "email", string[]>>;
  compliance: Partial<Record<"dnc" | "opt_out", string>>;
  extra_columns: string[];
  summary: {
    total_rows: number;
    valid: number;
    duplicates: number;
    invalid: number;
    without_phone: number;
    without_email: number;
    invalid_phone: number;
    do_not_contact: number;
  };
  errors: Array<{ row: number; reason: string; value: string }>;
  preview: CampaignContact[];
  imported?: number;
  total_contacts?: number;
};

export type CampaignOverview = {
  window_days: number;
  campaigns: { total: number; by_status: Partial<Record<CampaignStatus, number>> };
  contacts: number;
  calls: {
    contacts_called: number;
    attempts: number;
    by_status: Partial<Record<CallStatus, number>>;
    answered_by: Record<string, number>;
    completed: number;
    answered_by_person: number;
    voicemail: number;
    no_answer: number;
    busy: number;
    failed: number;
    in_progress: number;
    waiting: number;
    skipped: number;
    opted_out: number;
    talk_seconds: number;
    avg_duration_seconds: number;
    connect_rate_percent: number;
  };
  emails: { by_status: Partial<Record<EmailStatus, number>>; sent: number; failed: number };
  calls_by_day: Array<{ date: string; count: number }>;
};

export type FromNumber = {
  phone_number: string;
  friendly_name: string | null;
  /** Client tenant whose inbound AI agent uses this number — avoid marketing from it. */
  assigned_to: string | null;
  is_default: boolean;
};

export type Suppression = {
  id: string;
  channel: "phone" | "email";
  value: string;
  reason: "call_opt_out" | "email_unsubscribe" | "manual" | string;
  campaign_id: string | null;
  created_at: string;
};

export type CallFilters = {
  campaign_id?: string;
  call_status?: string;
  answered?: "" | "person" | "voicemail";
  opted_out?: boolean;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  per_page?: number;
};

// ─── Multipart upload / file download (the JSON client can't send these) ─────

const UPLOAD_TIMEOUT_MS = 120_000;

function authHeader(): Record<string, string> {
  const token = authSession.getAccessToken()?.trim();
  if (!token) throw new ApiError("Authorization token required", 401, { error: "No token available" });
  if (token.split(".").length !== 3) throw new ApiError("Invalid access token format", 401, { error: "Token is malformed" });
  return { Authorization: `Bearer ${token}` };
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(`${appConfig.apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: { ...authHeader(), ...(init.headers ?? {}) },
      signal: controller.signal
    });
    if (!response.ok) {
      let payload: unknown = null;
      try { payload = await response.json(); } catch { payload = null; }
      const message = payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "Something went wrong. Please try again.";
      throw new ApiError(message, response.status, payload);
    }
    return response;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Server is unreachable right now. Please wait a few seconds and try again.", 0, {
      error: err instanceof Error ? err.message : "Network error"
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const response = await rawFetch(path, { method: "POST", body: form });
  return (await response.json()) as T;
}

async function download(path: string, fallbackName: string): Promise<void> {
  const response = await rawFetch(path, { method: "GET" });
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── API client (super-admin only: campaigns are the platform's own outreach) ─

const BASE = "/admin/campaigns";

export const campaignsApi = {
  overview: (params: { campaign_id?: string; days?: number } = {}, signal?: AbortSignal) =>
    request<CampaignOverview>(`${BASE}/overview${qs(params)}`, { auth: true, signal }),

  listCalls: (params: CallFilters = {}, signal?: AbortSignal) =>
    request<{ calls: CampaignContact[]; pagination: Pagination }>(`${BASE}/calls${qs(params)}`, { auth: true, signal }),

  emailTemplates: (signal?: AbortSignal) =>
    request<{ templates: EmailTemplate[] }>(`${BASE}/email-templates`, { auth: true, signal }),

  fromNumbers: (signal?: AbortSignal) =>
    request<{ numbers: FromNumber[]; default: string | null }>(`${BASE}/from-numbers`, { auth: true, signal }),

  list: (params: { status?: string; page?: number; per_page?: number } = {}, signal?: AbortSignal) =>
    request<{ campaigns: Campaign[]; pagination: Pagination }>(`${BASE}${qs(params)}`, { auth: true, signal }),

  get: (id: string, signal?: AbortSignal) =>
    request<{ campaign: Campaign }>(`${BASE}/${id}`, { auth: true, signal }),

  create: (payload: CampaignSettings & { name: string }) =>
    request<{ campaign: Campaign }>(BASE, { method: "POST", body: payload, auth: true }),

  update: (id: string, payload: CampaignSettings) =>
    request<{ message: string; campaign: Campaign }>(`${BASE}/${id}`, { method: "PUT", body: payload, auth: true }),

  remove: (id: string) =>
    request<{ message: string }>(`${BASE}/${id}`, { method: "DELETE", auth: true }),

  uploadAudio: (id: string, file: Blob, filename: string) => {
    const form = new FormData();
    form.append("file", file, filename);
    return postForm<{ message: string; campaign: Campaign }>(`${BASE}/${id}/audio`, form);
  },

  getAudio: (id: string, signal?: AbortSignal) =>
    request<{ url: string; expires_in: number; file_name: string | null; size_bytes: number | null }>(
      `${BASE}/${id}/audio`, { auth: true, signal }
    ),

  importContacts: (id: string, file: File, options: { dryRun: boolean; defaultCountry?: string }) => {
    const form = new FormData();
    form.append("file", file, file.name);
    if (options.dryRun) form.append("dry_run", "true");
    if (options.defaultCountry) form.append("default_country", options.defaultCountry);
    return postForm<ImportPreview>(`${BASE}/${id}/contacts/import`, form);
  },

  listContacts: (id: string, params: { call_status?: string; search?: string; page?: number; per_page?: number } = {}, signal?: AbortSignal) =>
    request<{ contacts: CampaignContact[]; pagination: Pagination }>(`${BASE}/${id}/contacts${qs(params)}`, { auth: true, signal }),

  clearContacts: (id: string) =>
    request<{ message: string }>(`${BASE}/${id}/contacts`, { method: "DELETE", auth: true }),

  testCall: (id: string, phoneNumber: string) =>
    request<{ message: string; call_sid: string; to: string; from: string }>(
      `${BASE}/${id}/test-call`, { method: "POST", body: { phone_number: phoneNumber }, auth: true }
    ),

  testEmail: (id: string, email: string) =>
    request<{ message: string }>(`${BASE}/${id}/test-email`, { method: "POST", body: { email }, auth: true }),

  start: (id: string) =>
    request<{ message: string; warnings: string[]; campaign: Campaign }>(`${BASE}/${id}/start`, { method: "POST", auth: true }),

  pause: (id: string) =>
    request<{ message: string; campaign: Campaign }>(`${BASE}/${id}/pause`, { method: "POST", auth: true }),

  cancel: (id: string) =>
    request<{ message: string; campaign: Campaign }>(`${BASE}/${id}/cancel`, { method: "POST", auth: true }),

  exportCsv: (id: string) => download(`${BASE}/${id}/export`, "campaign-results.csv"),

  listSuppressions: (params: { channel?: string; search?: string; page?: number; per_page?: number } = {}, signal?: AbortSignal) =>
    request<{ suppressions: Suppression[]; pagination: Pagination }>(`${BASE}/suppressions${qs(params)}`, { auth: true, signal }),

  addSuppressions: (payload: { phones?: string[]; emails?: string[] }) =>
    request<{ message: string; added: number; invalid: string[] }>(`${BASE}/suppressions`, { method: "POST", body: payload, auth: true }),

  removeSuppression: (id: string) =>
    request<{ message: string }>(`${BASE}/suppressions/${id}`, { method: "DELETE", auth: true })
};
