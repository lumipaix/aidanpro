import { useEffect, useState } from "react";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { Badge } from "@/features/super-admin/components/campaigns/CampaignBits";
import { fmtDateTime } from "@/features/super-admin/utils/campaignFormat";
import type { Suppression } from "@/features/super-admin/api/campaignsApi";

const REASONS: Record<string, { label: string; tone: string }> = {
  call_opt_out: { label: "Pressed opt-out key", tone: "warning" },
  email_unsubscribe: { label: "Unsubscribed by email", tone: "warning" },
  manual: { label: "Added manually", tone: "neutral" }
};

/** Platform-wide list of phones / emails that no campaign will ever contact. */
export function DoNotContactTab() {
  const [entries, setEntries] = useState<Suppression[]>([]);
  const [channel, setChannel] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ channel: "", search: "", page: 1 });
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    campaignsApi.listSuppressions({ channel: query.channel, search: query.search, page: query.page, per_page: 50 }, controller.signal)
      .then(res => {
        setEntries(res.suppressions);
        setPages(res.pagination.pages || 1);
        setTotal(res.pagination.total);
      })
      .catch(err => { if (!isAbortError(err)) setError(err instanceof ApiError ? err.message : "Failed to load the list"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, reload]);

  const apply = () => { setLoading(true); setQuery({ channel, search: search.trim(), page: 1 }); };

  const add = async () => {
    const items = input.split(/[\n,;]+/).map(v => v.trim()).filter(Boolean);
    if (!items.length) return;
    try {
      setAdding(true);
      setMsg(null);
      const res = await campaignsApi.addSuppressions({
        emails: items.filter(v => v.includes("@")),
        phones: items.filter(v => !v.includes("@"))
      });
      setMsg({
        ok: true,
        text: `Added ${res.added} entr${res.added === 1 ? "y" : "ies"}.` + (res.invalid.length ? ` Not recognised: ${res.invalid.join(", ")}` : "")
      });
      setInput("");
      setReload(r => r + 1);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed to add" });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      setRemoving(id);
      await campaignsApi.removeSuppression(id);
      setReload(r => r + 1);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed to remove" });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <div className="detail-card">
        <div className="detail-card-header">
          <h2 className="detail-card-title">Add to the do-not-contact list</h2>
        </div>
        <div className="detail-card-body" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Numbers and emails here are never called or emailed by any campaign. People who press the opt-out key or
            unsubscribe from an email are added automatically.
          </p>
          <textarea className="field-input" rows={3} placeholder={"One per line or comma-separated, e.g.\n+1 204 555 0142, owner@business.com"}
            value={input} onChange={e => setInput(e.target.value)} />
          <div className="button-group">
            <button className="dashboard-button" disabled={adding || !input.trim()} onClick={() => void add()}>
              {adding ? "Adding…" : "Add to list"}
            </button>
          </div>
          {msg && <div className={`form-status${msg.ok ? "" : " error"}`}>{msg.text}</div>}
        </div>
      </div>

      <div className="sa-filter-bar">
        <label className="field-label" style={{ flex: "0 1 200px" }}>Type
          <select className="field-input" value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">Phones and emails</option>
            <option value="phone">Phones</option>
            <option value="email">Emails</option>
          </select>
        </label>
        <label className="field-label" style={{ flex: 2 }}>Search
          <input className="field-input" placeholder="Number or email…" value={search}
            onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") apply(); }} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="dashboard-button" onClick={apply}>Apply</button>
        </div>
      </div>

      {error && <div className="form-status error" style={{ marginBottom: 16 }}>{error}</div>}
      {loading ? (
        <div className="dashboard-table-container">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-block" style={{ height: 48, margin: "8px 16px", borderRadius: 8 }} />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state"><h3>The list is empty</h3><p>Nobody has opted out yet.</p></div>
      ) : (
        <>
          <p style={{ margin: "0 0 10px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{total.toLocaleString()} entries</p>
          <div className="dashboard-table-container" style={{ overflowX: "auto" }}>
            <table className="dashboard-table" style={{ minWidth: 640 }}>
              <thead>
                <tr><th>Phone / Email</th><th>Type</th><th>Why</th><th>Added</th><th /></tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const reason = REASONS[e.reason] ?? { label: e.reason, tone: "neutral" };
                  return (
                    <tr key={e.id}>
                      <td><span className="dashboard-code">{e.value}</span></td>
                      <td style={{ textTransform: "capitalize" }}>{e.channel}</td>
                      <td><Badge tone={reason.tone}>{reason.label}</Badge></td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.created_at)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="setup-step-action" style={{ fontSize: "0.82rem", color: "#b91c1c", borderColor: "#fecaca" }}
                          disabled={removing === e.id} onClick={() => void remove(e.id)}>
                          {removing === e.id ? "Removing…" : "Remove"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="sa-pagination">
              <button className="sa-pagination-btn" disabled={query.page <= 1} onClick={() => { setLoading(true); setQuery(q => ({ ...q, page: q.page - 1 })); }}>← Prev</button>
              <span className="sa-pagination-info">Page {query.page} of {pages}</span>
              <button className="sa-pagination-btn" disabled={query.page >= pages} onClick={() => { setLoading(true); setQuery(q => ({ ...q, page: q.page + 1 })); }}>Next →</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
