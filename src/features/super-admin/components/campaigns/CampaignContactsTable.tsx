import { useEffect, useState } from "react";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { Badge } from "@/features/super-admin/components/campaigns/CampaignBits";
import {
  CONTACT_STATUS_FILTERS, callOutcome, contactNote, fmtDateTime, fmtDuration
} from "@/features/super-admin/utils/campaignFormat";
import type { CampaignContact } from "@/features/super-admin/api/campaignsApi";

const EMAIL_TONE: Record<string, string> = { sent: "success", failed: "error", pending: "neutral", sending: "info", skipped: "neutral" };

/** `refreshKey` changes whenever the parent wants the current page re-fetched (imports, auto-refresh). */
export function CampaignContactsTable({ campaignId, emailEnabled, refreshKey }: {
  campaignId: string;
  emailEnabled: boolean;
  refreshKey: number;
}) {
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ status: "", search: "", page: 1 });
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    campaignsApi.listContacts(campaignId, { call_status: query.status, search: query.search, page: query.page, per_page: 50 }, controller.signal)
      .then(res => {
        setContacts(res.contacts);
        setPages(res.pagination.pages || 1);
        setTotal(res.pagination.total);
      })
      .catch(err => { if (!isAbortError(err)) setError(err instanceof ApiError ? err.message : "Failed to load contacts"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [campaignId, query, refreshKey]);

  const apply = () => { setLoading(true); setQuery({ status, search: search.trim(), page: 1 }); };
  const goTo = (page: number) => { setLoading(true); setQuery(q => ({ ...q, page })); };

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <h2 className="detail-card-title">Calls</h2>
        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>{total.toLocaleString()} businesses</span>
      </div>
      <div className="detail-card-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field-label" style={{ flex: "0 1 200px" }}>Outcome
            <select className="field-input" value={status} onChange={e => setStatus(e.target.value)}>
              {CONTACT_STATUS_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="field-label" style={{ flex: "1 1 220px" }}>Search
            <input className="field-input" placeholder="Business, phone or email…" value={search}
              onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") apply(); }} />
          </label>
          <button className="dashboard-button-secondary" onClick={apply}>Apply</button>
        </div>

        {error && <div className="form-status error">{error}</div>}
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="skeleton-block" style={{ height: 44, borderRadius: 8 }} />)
        ) : contacts.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><h3>No businesses</h3><p>Import a sheet to add businesses to this campaign.</p></div>
        ) : (
          <div className="dashboard-table-container" style={{ overflowX: "auto" }}>
            <table className="dashboard-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Business</th>
                  <th>Phone</th>
                  <th>Outcome</th>
                  <th>Attempts</th>
                  <th>Duration</th>
                  <th>Last Attempt</th>
                  {emailEnabled && <th>Email</th>}
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => {
                  const outcome = callOutcome(c);
                  return (
                    <tr key={c.id}>
                      <td style={{ color: "var(--text-muted)" }}>{c.row_number ?? "—"}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.business_name ?? "—"}</div>
                        {(c.contact_name || c.extra?.city) && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            {[c.contact_name, c.extra?.city].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td>{c.phone_number ? <span className="dashboard-code">{c.phone_number}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td>
                        <Badge tone={outcome.tone}>{outcome.label}</Badge>
                        {c.call_status === "pending" && c.call_next_attempt_at && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>next {fmtDateTime(c.call_next_attempt_at)}</div>
                        )}
                      </td>
                      <td>{c.call_attempts}</td>
                      <td>{fmtDuration(c.call_duration_seconds)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(c.call_last_attempt_at)}</td>
                      {emailEnabled && <td><Badge tone={EMAIL_TONE[c.email_status] ?? "neutral"}>{c.email_status}</Badge></td>}
                      <td style={{ maxWidth: 220, fontSize: "0.82rem", color: c.opted_out ? "#b45309" : "var(--text-muted)" }}>{contactNote(c) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="sa-pagination" style={{ marginTop: 0 }}>
            <button className="sa-pagination-btn" disabled={query.page <= 1} onClick={() => goTo(query.page - 1)}>← Prev</button>
            <span className="sa-pagination-info">Page {query.page} of {pages}</span>
            <button className="sa-pagination-btn" disabled={query.page >= pages} onClick={() => goTo(query.page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
