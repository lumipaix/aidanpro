import { useEffect, useState } from "react";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { TIMEZONES, VOICEMAIL_MODES, WEEKDAYS, fromNumberLabel, hhmm } from "@/features/super-admin/utils/campaignFormat";
import { CampaignEmailDesign } from "@/features/super-admin/components/campaigns/CampaignEmailDesign";
import type { Campaign, EmailTemplate, FromNumber, VoicemailMode } from "@/features/super-admin/api/campaignsApi";

type FormState = {
  name: string;
  from_number: string;
  timezone: string;
  call_window_start: string;
  call_window_end: string;
  call_days: number[];
  voicemail_mode: VoicemailMode;
  opt_out_enabled: boolean;
  opt_out_digit: string;
  max_call_attempts: number;
  retry_delay_minutes: number;
  max_concurrent_calls: number;
  ring_timeout_seconds: number;
  email_enabled: boolean;
  email_subject: string;
  email_body_html: string;
  email_body_text: string;
  email_from_name: string;
  email_reply_to: string;
};

function fromCampaign(c: Campaign): FormState {
  return {
    name: c.name,
    from_number: c.from_number ?? "",
    timezone: c.timezone ?? "UTC",
    call_window_start: hhmm(c.call_window_start),
    call_window_end: hhmm(c.call_window_end),
    call_days: c.call_days ?? [1, 2, 3, 4, 5],
    voicemail_mode: c.voicemail_mode,
    opt_out_enabled: c.opt_out_enabled,
    opt_out_digit: c.opt_out_digit,
    max_call_attempts: c.max_call_attempts,
    retry_delay_minutes: c.retry_delay_minutes,
    max_concurrent_calls: c.max_concurrent_calls,
    ring_timeout_seconds: c.ring_timeout_seconds,
    email_enabled: c.email_enabled,
    email_subject: c.email_subject ?? "",
    email_body_html: c.email_body_html ?? "",
    email_body_text: c.email_body_text ?? "",
    email_from_name: c.email_from_name ?? "",
    email_reply_to: c.email_reply_to ?? ""
  };
}

const same = (a: FormState, b: FormState) => JSON.stringify(a) === JSON.stringify(b);

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  );
}

export function CampaignSettingsForm({ campaign, editable, onSaved }: {
  campaign: Campaign;
  editable: boolean;
  onSaved: (campaign: Campaign) => void;
}) {
  const [baseline, setBaseline] = useState<FormState>(() => fromCampaign(campaign));
  const [form, setForm] = useState<FormState>(baseline);
  const [numbers, setNumbers] = useState<FromNumber[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  // Follow server-side changes unless the user has unsaved edits.
  useEffect(() => {
    const next = fromCampaign(campaign);
    setForm(current => (same(current, baseline) ? next : current));
    setBaseline(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);

  useEffect(() => {
    const controller = new AbortController();
    campaignsApi.fromNumbers(controller.signal)
      .then(res => setNumbers(res.numbers))
      .catch(err => { if (!isAbortError(err)) setNumbers([]); });
    return () => controller.abort();
  }, []);

  const dirty = !same(form, baseline);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }));
  const toggleDay = (day: number) =>
    set("call_days", form.call_days.includes(day) ? form.call_days.filter(d => d !== day) : [...form.call_days, day].sort());

  const save = async () => {
    try {
      setSaving(true);
      setMsg(null);
      const res = await campaignsApi.update(campaign.id, {
        ...form,
        from_number: form.from_number || null,
        email_subject: form.email_subject || null,
        email_body_html: form.email_body_html || null,
        email_body_text: form.email_body_text || null,
        email_from_name: form.email_from_name || null,
        email_reply_to: form.email_reply_to || null
      });
      setBaseline(fromCampaign(res.campaign));
      setForm(fromCampaign(res.campaign));
      onSaved(res.campaign);
      setMsg({ text: "Settings saved.", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : "Failed to save", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (t: EmailTemplate) =>
    setForm(f => ({
      ...f,
      email_subject: t.subject,
      email_body_html: t.body_html,
      email_body_text: t.body_text,
      email_from_name: f.email_from_name || t.from_name,
    }));

  const sendTestEmail = async () => {
    try {
      setSendingTest(true);
      setEmailMsg(null);
      const res = await campaignsApi.testEmail(campaign.id, testEmail.trim());
      setEmailMsg({ text: res.message, ok: true });
    } catch (err) {
      setEmailMsg({ text: err instanceof ApiError ? err.message : "Test email failed", ok: false });
    } finally {
      setSendingTest(false);
    }
  };

  const disabled = !editable || saving;
  const numberOptions = numbers.some(n => n.phone_number === form.from_number) || !form.from_number
    ? numbers
    : [{ phone_number: form.from_number, friendly_name: null, assigned_to: null, is_default: false }, ...numbers];
  const voicemailHint = VOICEMAIL_MODES.find(m => m.value === form.voicemail_mode)?.hint;

  return (
    <div className="form-section" style={{ marginBottom: 20 }}>
      <div className="form-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h2 className="form-section-title">3 · Settings</h2>
          <p className="form-section-desc">
            {editable ? "Who calls, when, and what happens on voicemail." : "Pause the campaign to change settings."}
          </p>
        </div>
        {editable && (
          <div className="button-group">
            {dirty && <button className="dashboard-button-secondary" disabled={saving} onClick={() => setForm(baseline)}>Discard</button>}
            <button className="dashboard-button" disabled={!dirty || saving || !form.name.trim() || form.call_days.length === 0} onClick={() => void save()}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
      </div>
      <div className="form-section-body">
        {msg && <div className={`form-status${msg.ok ? "" : " error"}`}>{msg.text}</div>}

        <div className="sa-form-grid-2">
          <label className="field-label">Campaign name
            <input className="field-input" value={form.name} disabled={disabled} onChange={e => set("name", e.target.value)} />
          </label>
          <label className="field-label">Caller ID (Twilio number)
            <select className="field-input" value={form.from_number} disabled={disabled} onChange={e => set("from_number", e.target.value)}>
              {numberOptions.map(n => <option key={n.phone_number} value={n.phone_number}>{fromNumberLabel(n)}</option>)}
            </select>
          </label>
        </div>

        <div className="sa-form-grid-3">
          <label className="field-label">Recipients' timezone
            <select className="field-input" value={form.timezone} disabled={disabled} onChange={e => set("timezone", e.target.value)}>
              {(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <label className="field-label">Call from
            <input className="field-input" type="time" value={form.call_window_start} disabled={disabled} onChange={e => set("call_window_start", e.target.value)} />
          </label>
          <label className="field-label">Until
            <input className="field-input" type="time" value={form.call_window_end} disabled={disabled} onChange={e => set("call_window_end", e.target.value)} />
          </label>
        </div>

        <div className="field-label">Calling days
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEEKDAYS.map(d => {
              const active = form.call_days.includes(d.value);
              return (
                <button key={d.value} type="button" disabled={disabled} onClick={() => toggleDay(d.value)}
                  style={{
                    padding: "6px 12px", borderRadius: 99, fontSize: "0.82rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
                    border: `1px solid ${active ? "var(--brand-blue)" : "var(--border-mid)"}`,
                    background: active ? "var(--brand-blue)" : "var(--surface)",
                    color: active ? "#fff" : "var(--text-secondary)", opacity: disabled ? 0.6 : 1
                  }}>
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="field-label">When a voicemail answers
          <select className="field-input" value={form.voicemail_mode} disabled={disabled} onChange={e => set("voicemail_mode", e.target.value as VoicemailMode)}>
            {VOICEMAIL_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {voicemailHint && <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)" }}>{voicemailHint}</span>}
        </label>

        <div className="sa-form-grid-3">
          <label className="field-label">Attempts per business
            <input className="field-input" type="number" min={1} max={5} value={form.max_call_attempts} disabled={disabled}
              onChange={e => set("max_call_attempts", Number(e.target.value))} />
          </label>
          <label className="field-label">Retry busy / no-answer after (min)
            <input className="field-input" type="number" min={1} max={10080} value={form.retry_delay_minutes} disabled={disabled}
              onChange={e => set("retry_delay_minutes", Number(e.target.value))} />
          </label>
          <label className="field-label">Calls at the same time
            <input className="field-input" type="number" min={1} max={20} value={form.max_concurrent_calls} disabled={disabled}
              onChange={e => set("max_concurrent_calls", Number(e.target.value))} />
          </label>
        </div>

        <div className="toggle-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div className="toggle-row-label">
            <span>Opt-out keypress</span>
            <small>After the message: "To stop receiving these calls, press {form.opt_out_digit}." Adds the number to the do-not-call list.</small>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select className="field-input" style={{ width: 64 }} value={form.opt_out_digit} disabled={disabled || !form.opt_out_enabled}
              onChange={e => set("opt_out_digit", e.target.value)}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <Toggle checked={form.opt_out_enabled} disabled={disabled} onChange={v => set("opt_out_enabled", v)} />
          </div>
        </div>

        <div className="toggle-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div className="toggle-row-label">
            <span>Also send an email</span>
            <small>
              Emails each business that has an address in the sheet{campaign.call_enabled ? ", after its call has finished" : ""}.
              Includes an unsubscribe link automatically.
            </small>
          </div>
          <Toggle checked={form.email_enabled} disabled={disabled} onChange={v => set("email_enabled", v)} />
        </div>

        {form.email_enabled && (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="sa-form-grid-2">
              <label className="field-label">From name
                <input className="field-input" placeholder="e.g. Tim at Aidan Pro" value={form.email_from_name} disabled={disabled}
                  onChange={e => set("email_from_name", e.target.value)} />
              </label>
              <label className="field-label">Reply-to email
                <input className="field-input" type="email" placeholder="tim@example.com" value={form.email_reply_to} disabled={disabled}
                  onChange={e => set("email_reply_to", e.target.value)} />
              </label>
            </div>
            <label className="field-label">Subject
              <input className="field-input" placeholder="Quick question for {{business_name}}" value={form.email_subject} disabled={disabled}
                onChange={e => set("email_subject", e.target.value)} />
            </label>
            <CampaignEmailDesign
              html={form.email_body_html}
              text={form.email_body_text}
              disabled={disabled}
              onChange={patch => setForm(f => ({ ...f, ...patch }))}
              onApplyTemplate={applyTemplate}
            />
            <label className="field-label">Send a test email
              <div style={{ display: "flex", gap: 8 }}>
                <input className="field-input" type="email" placeholder="you@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                <button className="dashboard-button-secondary" style={{ whiteSpace: "nowrap" }}
                  disabled={sendingTest || !testEmail.trim() || dirty} title={dirty ? "Save settings first" : undefined}
                  onClick={() => void sendTestEmail()}>
                  {sendingTest ? "Sending…" : "Send test"}
                </button>
              </div>
            </label>
            {emailMsg && <div className={`form-status${emailMsg.ok ? "" : " error"}`}>{emailMsg.text}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
