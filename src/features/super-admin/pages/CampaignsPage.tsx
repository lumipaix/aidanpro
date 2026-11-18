import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { Badge, ProgressBar } from "@/features/super-admin/components/campaigns/CampaignBits";
import { DoNotContactTab } from "@/features/super-admin/components/campaigns/DoNotContactTab";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { withRetry } from "@/shared/utils/withRetry";
import { usePolling } from "@/features/super-admin/utils/usePolling";
import {
  CALL_OUTCOME_FILTERS, CAMPAIGN_STATUS_TONE, TIMEZONES,
  callOutcome, contactNote, fmtDateTime, fmtDuration, fmtTalkTime, fromNumberLabel
} from "@/features/super-admin/utils/campaignFormat";
import type { Campaign, CampaignContact, CampaignOverview, CallFilters, FromNumber } from "@/features/super-admin/api/campaignsApi";

type Tab = "campaigns" | "calls" | "do-not-contact";

const IconPhoneOut = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 7 23 1 17 1" /><line x1="16" y1="8" x2="23" y2="1" />
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.56 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
const IconUser = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconVoicemail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5.5" cy="11.5" r="4.5" /><circle cx="18.5" cy="11.5" r="4.5" /><line x1="5.5" y1="16" x2="18.5" y2="16" />
  </svg>
);
const IconBan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

function OverviewCards({ overview }: { overview: CampaignOverview | null }) {
  const c = overview?.calls;
  return (
    <div className="stats-grid-4">
      <div className="stat-card" style={{ cursor: "default" }}>
        <div className="stat-card-top"><div className="stat-icon stat-icon-blue"><IconPhoneOut /></div></div>
        <div>
          <div className="stat-card-value">{c ? c.contacts_called.toLocaleString() : "—"}</div>
          <div className="stat-card-label">Businesses Called</div>
          <div className="stat-card-meta">{c ? `${c.attempts.toLocaleString()} dial attempts · ${c.waiting} waiting` : ""}</div>
        </div>
      </div>
      <div className="stat-card" style={{ cursor: "default" }}>
        <div className="stat-card-top"><div className="stat-icon stat-icon-green"><IconUser /></div></div>
        <div>
          <div className="stat-card-value">{c ? c.answered_by_person.toLocaleString() : "—"}</div>
          <div className="stat-card-label">Answered by a Person</div>
          <div className="stat-card-meta">{c ? `${c.connect_rate_percent}% connected · avg ${fmtDuration(Math.round(c.avg_duration_seconds))}` : ""}</div>
        </div>
      </div>
      <div className="stat-card" style={{ cursor: "default" }}>
        <div className="stat-card-top"><div className="stat-icon stat-icon-purple"><IconVoicemail /></div></div>
        <div>
          <div className="stat-card-value">{c ? c.voicemail.toLocaleString() : "—"}</div>
          <div className="stat-card-label">Voicemails Reached</div>
          <div className="stat-card-meta">{c ? `${fmtTalkTime(c.talk_seconds)} total talk time` : ""}</div>
        </div>
      </div>
      <div className="stat-card" style={{ cursor: "default" }}>
        <div className="stat-card-top"><div className="stat-icon stat-icon-amber"><IconBan /></div></div>
        <div>
          <div className="stat-card-value">{c ? c.opted_out.toLocaleString() : "—"}</div>
          <div className="stat-card-label">Opted Out</div>
          <div className="stat-card-meta">{c ? `${c.no_answer} no answer · ${c.busy} busy · ${c.failed} failed` : ""}</div>
        </div>
      </div>
    </div>
  );
}

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [numbers, setNumbers] = useState<FromNumber[]>([]);
  const [form, setForm] = useState({ name: "", from_number: "", timezone: "America/Winnipeg" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    campaignsApi.fromNumbers(controller.signal)
      .then(res => {
        setNumbers(res.numbers);
        const preferred = res.numbers.find(n => n.phone_number === res.default) ?? res.numbers[0];
        setForm(f => ({ ...f, from_number: preferred?.phone_number ?? "" }));
      })
      .catch(err => { if (!isAbortError(err)) setError(err instanceof ApiError ? err.message : "Failed to load Twilio numbers"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const selected = numbers.find(n => n.phone_number === form.from_number);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await campaignsApi.create({
        name: form.name.trim(),
        from_number: form.from_number || undefined,
        timezone: form.timezone
      });
      navigate(`/super-admin/campaigns/${res.campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create campaign");
      setSaving(false);
    }
  };

  return (
    <div className="sa-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sa-modal sa-modal-md" style={{ animation: "fade-up 0.22s cubic-bezier(0.22,1,0.36,1) both" }}>
        <div className="sa-modal-header">
          <div>
            <h2 className="sa-modal-title">New Call Campaign</h2>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Next you'll upload the recording and the businesses sheet.
            </p>
          </div>
          <button className="sa-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sa-modal-body" style={{ gap: 16 }}>
          {loading ? (
            <div className="skeleton-block" style={{ height: 150, borderRadius: 10 }} />
          ) : (
            <>
              <label className="field-label">Campaign name
                <input className="field-input" autoFocus placeholder="e.g. Tim — Winnipeg HVAC" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter" && form.name.trim() && !saving) void submit(); }} />
              </label>
              <label className="field-label">Caller ID (Twilio number)
                <select className="field-input" value={form.from_number} onChange={e => setForm(f => ({ ...f, from_number: e.target.value }))}>
                  {numbers.map(n => <option key={n.phone_number} value={n.phone_number}>{fromNumberLabel(n)}</option>)}
                </select>
                {selected?.assigned_to && (
                  <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "#b45309" }}>
                    This is {selected.assigned_to}'s number — call-backs would reach their AI agent.
                  </span>
                )}
              </label>
              <label className="field-label">Recipients' timezone (calling hours)
                <select className="field-input" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </label>
            </>
          )}
          {error && <div className="form-status error">{error}</div>}
        </div>
        <div className="sa-modal-footer">
          <button className="dashboard-button-secondary" onClick={onClose}>Cancel</button>
          <button className="dashboard-button" disabled={saving || loading || !form.name.trim()} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CallsTab({ campaigns }: { campaigns: Campaign[] }) {
  const empty: CallFilters = { campaign_id: "", call_status: "", answered: "", from_date: "", to_date: "", search: "" };
  const [draft, setDraft] = useState<CallFilters>(empty);
  const [filters, setFilters] = useState<CallFilters>(empty);
  const [calls, setCalls] = useState<CampaignContact[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (p: number, f: CallFilters, signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const res = await withRetry(() => campaignsApi.listCalls({ ...f, page: p, per_page: 25 }, signal), signal);
      setCalls(res.calls);
      setPage(p);
      setPages(res.pagination.pages || 1);
      setTotal(res.pagination.total);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof ApiError ? err.message : "Failed to load calls");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(1, filters, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = () => { setFilters(draft); void load(1, draft); };

  return (
    <>
      <div className="sa-filter-bar">
        <label className="field-label">Campaign
          <select className="field-input" value={draft.campaign_id} onChange={e => setDraft(d => ({ ...d, campaign_id: e.target.value }))}>
            <option value="">All campaigns</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field-label">Outcome
          <select className="field-input" value={draft.call_status} onChange={e => setDraft(d => ({ ...d, call_status: e.target.value }))}>
            {CALL_OUTCOME_FILTERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="field-label">Answered by
          <select className="field-input" value={draft.answered} onChange={e => setDraft(d => ({ ...d, answered: e.target.value as CallFilters["answered"] }))}>
            <option value="">Anyone</option>
            <option value="person">A person</option>
            <option value="voicemail">Voicemail</option>
          </select>
        </label>
        <label className="field-label">From
          <input className="field-input" type="date" value={draft.from_date} onChange={e => setDraft(d => ({ ...d, from_date: e.target.value }))} />
        </label>
        <label className="field-label">To
          <input className="field-input" type="date" value={draft.to_date} onChange={e => setDraft(d => ({ ...d, to_date: e.target.value }))} />
        </label>
        <label className="field-label" style={{ flex: 2 }}>Search
          <input className="field-input" placeholder="Business, phone or email…" value={draft.search}
            onChange={e => setDraft(d => ({ ...d, search: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") apply(); }} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="dashboard-button" onClick={apply}>Apply</button>
        </div>
      </div>

      {loading && (
        <div className="dashboard-table-container">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton-block" style={{ height: 52, margin: "8px 16px", borderRadius: 8 }} />)}
        </div>
      )}
      {error && !loading && (
        <>
          <div className="form-status error" style={{ marginBottom: 16 }}>{error}</div>
          <button className="dashboard-button" onClick={() => void load(page, filters)}>Retry</button>
        </>
      )}
      {!loading && !error && (calls.length === 0 ? (
        <div className="empty-state"><h3>No calls yet</h3><p>Calls appear here as soon as a campaign starts dialing.</p></div>
      ) : (
        <>
          <p style={{ margin: "0 0 10px", fontSize: "0.82rem", color: "var(--text-muted)" }}>{total.toLocaleString()} dialed businesses</p>
          <div className="dashboard-table-container" style={{ overflowX: "auto" }}>
            <table className="dashboard-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Last Attempt</th>
                  <th>Business</th>
                  <th>Phone</th>
                  <th>Campaign</th>
                  <th>Outcome</th>
                  <th>Attempts</th>
                  <th>Duration</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {calls.map(call => {
                  const outcome = callOutcome(call);
                  return (
                    <tr key={call.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(call.call_last_attempt_at)}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", minWidth: 150 }}>{call.business_name ?? "—"}</div>
                        {call.contact_name && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{call.contact_name}</div>}
                      </td>
                      <td><span className="dashboard-code">{call.phone_number}</span></td>
                      <td style={{ minWidth: 170 }}>
                        <Link to={`/super-admin/campaigns/${call.campaign_id}`} style={{ color: "var(--brand-blue)", fontWeight: 600, textDecoration: "none" }}>
                          {call.campaign_name ?? "Campaign"}
                        </Link>
                      </td>
                      <td><Badge tone={outcome.tone}>{outcome.label}</Badge></td>
                      <td>{call.call_attempts}</td>
                      <td>{fmtDuration(call.call_duration_seconds)}</td>
                      <td style={{ maxWidth: 220, fontSize: "0.82rem", color: call.opted_out ? "#b45309" : "var(--text-muted)" }}>{contactNote(call) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="sa-pagination">
              <button className="sa-pagination-btn" disabled={page <= 1} onClick={() => void load(page - 1, filters)}>← Prev</button>
              <span className="sa-pagination-info">Page {page} of {pages}</span>
              <button className="sa-pagination-btn" disabled={page >= pages} onClick={() => void load(page + 1, filters)}>Next →</button>
            </div>
          )}
        </>
      ))}
    </>
  );
}

export function CampaignsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [overview, setOverview] = useState<CampaignOverview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async (p: number, signal?: AbortSignal, quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      setError(null);
      const [ov, list] = await withRetry(() => Promise.all([
        campaignsApi.overview({}, signal),
        campaignsApi.list({ page: p, per_page: 50 }, signal)
      ]), signal);
      setOverview(ov);
      setCampaigns(list.campaigns);
      setPage(p);
      setPages(list.pagination.pages || 1);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof ApiError ? err.message : "Failed to load campaigns");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(1, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = overview?.campaigns.by_status.running ?? 0;
  // Keep the tiles and progress bars live while something is dialing.
  usePolling(() => { void load(page, undefined, true); }, 15_000, running > 0 && tab === "campaigns");

  return (
    <div className="dashboard-page">
      <div className="page-hero">
        <div>
          <h1>Call Campaigns</h1>
          <p className="page-subtitle">Broadcast a recorded message to a list of businesses and track every call</p>
        </div>
        <div className="page-hero-badges" style={{ gap: 10 }}>
          {running > 0 && <Badge tone="info">{running} running</Badge>}
          <button className="dashboard-button" onClick={() => setShowCreate(true)}>+ New Campaign</button>
        </div>
      </div>

      {error && !loading && (
        <>
          <div className="form-status error" style={{ marginBottom: 16 }}>{error}</div>
          <button className="dashboard-button" style={{ marginBottom: 20 }} onClick={() => void load(page)}>Retry</button>
        </>
      )}

      {loading && !overview ? (
        <div className="stats-grid-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton-block skeleton-stat" />)}</div>
      ) : (
        <OverviewCards overview={overview} />
      )}

      <div className="sa-tabs">
        <button className={`sa-tab${tab === "campaigns" ? " active" : ""}`} onClick={() => setTab("campaigns")}>Campaigns</button>
        <button className={`sa-tab${tab === "calls" ? " active" : ""}`} onClick={() => setTab("calls")}>Every Call</button>
        <button className={`sa-tab${tab === "do-not-contact" ? " active" : ""}`} onClick={() => setTab("do-not-contact")}>Do-Not-Contact</button>
      </div>

      {tab === "campaigns" && (
        loading ? (
          <div className="dashboard-table-container">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton-block" style={{ height: 52, margin: "8px 16px", borderRadius: 8 }} />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="empty-state">
            <h3>No campaigns yet</h3>
            <p>Create one, upload the recorded message and the businesses sheet, then start calling.</p>
            <button className="dashboard-button" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>+ New Campaign</button>
          </div>
        ) : (
          <>
            <div className="dashboard-table-container" style={{ overflowX: "auto" }}>
              <table className="dashboard-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Caller ID</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Contacts</th>
                    <th>Answered</th>
                    <th>Voicemail</th>
                    <th>Opted Out</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/super-admin/campaigns/${c.id}`)}>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</td>
                      <td><span className="dashboard-code">{c.from_number ?? "—"}</span></td>
                      <td><Badge tone={CAMPAIGN_STATUS_TONE[c.status]}>{c.status}</Badge></td>
                      <td><ProgressBar percent={c.stats?.progress_percent ?? 0} /></td>
                      <td>{(c.stats?.contacts ?? c.total_contacts).toLocaleString()}</td>
                      <td>{c.stats?.calls.answered_by_person ?? 0}</td>
                      <td>{c.stats?.calls.voicemail ?? 0}</td>
                      <td>{c.stats?.calls.opted_out ?? 0}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="sa-pagination">
                <button className="sa-pagination-btn" disabled={page <= 1} onClick={() => void load(page - 1)}>← Prev</button>
                <span className="sa-pagination-info">Page {page} of {pages}</span>
                <button className="sa-pagination-btn" disabled={page >= pages} onClick={() => void load(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )
      )}

      {tab === "calls" && <CallsTab campaigns={campaigns} />}
      {tab === "do-not-contact" && <DoNotContactTab />}

      {showCreate && <NewCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
