import { useEffect, useMemo, useState } from "react";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { isAbortError } from "@/shared/api/httpClient";
import type { EmailTemplate } from "@/features/super-admin/api/campaignsApi";

// Sample lead used only for the in-browser preview ("Send test" uses real data).
const SAMPLE: Record<string, string> = {
  first_name: "Pat",
  contact_name: "Pat Lee",
  business_name: "Maple Heating & Cooling",
  city: "Winnipeg",
  email: "pat@maple.example",
  phone: "+1 204 555 0142",
  sender_name: "Aidan Pro",
  sender_address: "(your mailing address appears here)",
  unsubscribe_url: "#",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Same rules as the backend: {{field}} or {{field|fallback}}. */
function fillSample(template: string) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^{}]*))?\}\}/g, (_m, key: string, fallback?: string) => {
    const value = SAMPLE[key];
    if (value) return escapeHtml(value);
    return fallback !== undefined ? fallback.trim() : "";
  });
}

export function CampaignEmailDesign({ html, text, disabled, onChange, onApplyTemplate }: {
  html: string;
  text: string;
  disabled: boolean;
  onChange: (patch: { email_body_html?: string; email_body_text?: string }) => void;
  onApplyTemplate: (template: EmailTemplate) => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [view, setView] = useState<"preview" | "html" | "text">(html ? "preview" : "text");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    const controller = new AbortController();
    campaignsApi.emailTemplates(controller.signal)
      .then(res => {
        setTemplates(res.templates);
        setTemplateId(id => id || res.templates[0]?.id || "");
      })
      .catch(err => { if (!isAbortError(err)) setTemplates([]); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!html && view !== "text") setView("text");
  }, [html, view]);

  const preview = useMemo(() => (html ? fillSample(html) : ""), [html]);

  const apply = () => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    if ((html || text) && !window.confirm("Replace the current subject and message with this template?")) return;
    onApplyTemplate(template);
    setView("preview");
  };

  const removeDesign = () => {
    if (window.confirm("Remove the designed (HTML) version and send plain text only?")) {
      onChange({ email_body_html: "" });
      setView("text");
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {templates.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field-label" style={{ flex: "1 1 260px", margin: 0 }}>Start from a template
            <select className="field-input" value={templateId} disabled={disabled} onChange={e => setTemplateId(e.target.value)}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button type="button" className="dashboard-button-secondary" disabled={disabled || !templateId} onClick={apply}>
            Use template
          </button>
        </div>
      )}

      <div>
        <div className="sa-tabs" style={{ marginBottom: 10 }}>
          {html && <button type="button" className={`sa-tab${view === "preview" ? " active" : ""}`} onClick={() => setView("preview")}>Preview</button>}
          {html && <button type="button" className={`sa-tab${view === "html" ? " active" : ""}`} onClick={() => setView("html")}>Edit HTML</button>}
          <button type="button" className={`sa-tab${view === "text" ? " active" : ""}`} onClick={() => setView("text")}>
            {html ? "Plain-text version" : "Message"}
          </button>
        </div>

        {view === "preview" && html && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Preview with a sample lead. Use “Send test” below to see it in a real inbox.
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className={width === "desktop" ? "dashboard-button" : "dashboard-button-secondary"}
                  style={{ padding: "4px 10px", fontSize: "0.78rem" }} onClick={() => setWidth("desktop")}>Desktop</button>
                <button type="button" className={width === "mobile" ? "dashboard-button" : "dashboard-button-secondary"}
                  style={{ padding: "4px 10px", fontSize: "0.78rem" }} onClick={() => setWidth("mobile")}>Mobile</button>
              </div>
            </div>
            <div style={{ background: "#EEF2F7", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={preview}
                style={{ display: "block", width: width === "mobile" ? 375 : "100%", maxWidth: "100%", height: 620, border: 0, margin: "0 auto", background: "#EEF2F7" }}
              />
            </div>
          </div>
        )}

        {view === "html" && html && (
          <label className="field-label" style={{ margin: 0 }}>
            <textarea className="field-input" rows={16} value={html} disabled={disabled} spellCheck={false}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.78rem" }}
              onChange={e => onChange({ email_body_html: e.target.value })} />
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)" }}>
              <span>Advanced: edit the email's HTML directly.</span>
              <button type="button" onClick={removeDesign} disabled={disabled}
                style={{ background: "none", border: 0, padding: 0, color: "#b91c1c", cursor: "pointer", fontSize: "0.78rem" }}>
                Remove design
              </button>
            </span>
          </label>
        )}

        {view === "text" && (
          <label className="field-label" style={{ margin: 0 }}>
            <textarea className="field-input" rows={html ? 10 : 7} value={text} disabled={disabled}
              placeholder={"Hi {{first_name|there}},\n\n…"} onChange={e => onChange({ email_body_text: e.target.value })} />
            {html && (
              <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Shown by email apps that don't display designed emails. Leave empty to generate it from the design.
              </span>
            )}
          </label>
        )}
      </div>

      <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "var(--text-muted)" }}>
        Placeholders: {"{{first_name}}"}, {"{{business_name}}"}, {"{{contact_name}}"}, {"{{city}}"} and any other sheet column in snake_case.
        Add a fallback for empty values with {"{{first_name|there}}"}.
      </span>
    </div>
  );
}
