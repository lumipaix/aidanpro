import { useRef, useState } from "react";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { ApiError } from "@/shared/api/httpClient";
import { StatChip } from "@/features/super-admin/components/campaigns/CampaignBits";
import type { Campaign, ImportPreview } from "@/features/super-admin/api/campaignsApi";

const COUNTRIES = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" }
];

const FIELD_LABELS: Record<string, string> = {
  business_name: "Business",
  contact_name: "Contact",
  phone: "Phone",
  email: "Email"
};

const ERROR_REASONS: Record<string, string> = {
  no_phone_or_email: "No phone or email",
  invalid_phone_and_no_email: "Invalid phone, no email"
};

export function CampaignImportCard({ campaign, editable, onImported }: {
  campaign: Campaign;
  editable: boolean;
  onImported: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [country, setCountry] = useState("CA");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [working, setWorking] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async (selected: File, defaultCountry: string) => {
    try {
      setWorking("preview");
      setError(null);
      setPreview(await campaignsApi.importContacts(campaign.id, selected, { dryRun: true, defaultCountry }));
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Could not read the sheet");
    } finally {
      setWorking(null);
    }
  };

  const handleFile = (selected: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!selected) return;
    setFile(selected);
    void runPreview(selected, country);
  };

  const confirmImport = async () => {
    if (!file) return;
    try {
      setWorking("import");
      setError(null);
      const res = await campaignsApi.importContacts(campaign.id, file, { dryRun: false, defaultCountry: country });
      setPreview(null);
      setFile(null);
      onImported(`Imported ${res.imported ?? 0} businesses from ${file.name}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setWorking(null);
    }
  };

  const s = preview?.summary;

  return (
    <div className="detail-card" style={{ marginBottom: 0 }}>
      <div className="detail-card-header">
        <h2 className="detail-card-title">2 · Businesses</h2>
        <span className={`badge badge-${campaign.total_contacts ? "success" : "warning"}`}>
          <span className="badge-dot" />{campaign.total_contacts.toLocaleString()} contacts
        </span>
      </div>
      <div className="detail-card-body" style={{ display: "grid", gap: 14 }}>
        {!editable ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>Pause the campaign to import more businesses.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
              Upload an Excel (.xlsx) or CSV sheet. Phone and email columns are detected automatically
              (e.g. D&amp;B exports' "Direct Phone" / "Phone"); fax numbers are never dialed and rows flagged
              do-not-call or opted out are skipped. Numbers already in this campaign are ignored.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="field-label" style={{ flex: "0 1 200px" }}>Numbers without country code
                <select className="field-input" value={country} disabled={!!working}
                  onChange={e => { setCountry(e.target.value); if (file) void runPreview(file, e.target.value); }}>
                  {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.csv" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files?.[0])} />
              <button className="dashboard-button-secondary" disabled={!!working} onClick={() => fileInput.current?.click()}>
                {working === "preview" ? "Reading sheet…" : file ? "Choose another sheet" : "Choose sheet"}
              </button>
            </div>
          </>
        )}

        {error && <div className="form-status error">{error}</div>}

        {preview && s && (
          <div style={{ display: "grid", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Preview of {file?.name} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· nothing saved yet</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatChip label="Ready to import" value={s.valid} color="#15803d" />
              <StatChip label="Duplicates" value={s.duplicates} />
              <StatChip label="Unusable rows" value={s.invalid} color={s.invalid ? "#b91c1c" : undefined} />
              <StatChip label="Do-not-contact" value={s.do_not_contact} color={s.do_not_contact ? "#b45309" : undefined} />
              <StatChip label="No email" value={s.without_email} />
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", display: "grid", gap: 4 }}>
              {Object.entries(preview.columns).map(([field, headers]) => (
                <div key={field}><strong>{FIELD_LABELS[field] ?? field}:</strong> {headers?.join(" → ")}</div>
              ))}
              {Object.keys(preview.compliance).length > 0 && (
                <div><strong>Do-not-contact columns honoured:</strong> {Object.values(preview.compliance).join(", ")}</div>
              )}
            </div>
            {preview.errors.length > 0 && (
              <div className="form-status error" style={{ fontSize: "0.82rem" }}>
                {preview.errors.slice(0, 5).map(e => (
                  <div key={e.row}>Row {e.row}: {ERROR_REASONS[e.reason] ?? e.reason}{e.value ? ` (${e.value})` : ""}</div>
                ))}
                {preview.errors.length > 5 && <div>…and {preview.errors.length - 5} more</div>}
              </div>
            )}
            {preview.preview.length > 0 && (
              <div className="dashboard-table-container" style={{ overflowX: "auto" }}>
                <table className="dashboard-table" style={{ minWidth: 520 }}>
                  <thead><tr><th>Row</th><th>Business</th><th>Phone</th><th>Email</th></tr></thead>
                  <tbody>
                    {preview.preview.slice(0, 5).map(c => (
                      <tr key={c.row_number ?? c.phone_number ?? c.email ?? ""}>
                        <td>{c.row_number}</td>
                        <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.business_name ?? "—"}</td>
                        <td>
                          {c.phone_number
                            ? <span className="dashboard-code">{c.phone_number}</span>
                            : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          {c.call_status === "skipped" && c.phone_number && (
                            <span style={{ marginLeft: 6, fontSize: "0.75rem", color: "#b45309" }}>won't call</span>
                          )}
                        </td>
                        <td>{c.email ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="button-group">
              <button className="dashboard-button" disabled={!!working || s.valid === 0} onClick={() => void confirmImport()}>
                {working === "import" ? "Importing…" : `Import ${s.valid} business${s.valid === 1 ? "" : "es"}`}
              </button>
              <button className="dashboard-button-secondary" disabled={!!working} onClick={() => { setPreview(null); setFile(null); }}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
