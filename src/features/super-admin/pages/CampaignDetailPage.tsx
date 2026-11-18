import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { withRetry } from "@/shared/utils/withRetry";
import { Badge, ConfirmModal, ProgressBar, StatChip } from "@/features/super-admin/components/campaigns/CampaignBits";
import { CampaignAudioCard } from "@/features/super-admin/components/campaigns/CampaignAudioCard";
import { CampaignImportCard } from "@/features/super-admin/components/campaigns/CampaignImportCard";
import { CampaignSettingsForm } from "@/features/super-admin/components/campaigns/CampaignSettingsForm";
import { CampaignContactsTable } from "@/features/super-admin/components/campaigns/CampaignContactsTable";
import { CAMPAIGN_STATUS_TONE, WEEKDAYS, hhmm } from "@/features/super-admin/utils/campaignFormat";
import { usePolling } from "@/features/super-admin/utils/usePolling";
import type { Campaign } from "@/features/super-admin/api/campaignsApi";

const REFRESH_MS = 10_000;

type Notice = { text: string; tone: "success" | "error" | "info"; items?: string[] } | null;
type Pending = "start" | "pause" | "cancel" | "delete" | "export" | null;

export function CampaignDetailPage() {
  const { campaignId = "" } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = async (signal?: AbortSignal) => {
    try {
      const res = await withRetry(() => campaignsApi.get(campaignId, signal), signal);
      setCampaign(res.campaign);
      setError(null);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof ApiError ? err.message : "Failed to load campaign");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Live progress while dialing (paused while the tab is in the background).
  const isRunning = campaign?.status === "running";
  usePolling(() => { void load(); setRefreshKey(k => k + 1); }, REFRESH_MS, isRunning);

  const run = async (action: Exclude<Pending, null>) => {
    if (!campaign) return;
    setPending(action);
    setNotice(null);
    try {
      if (action === "start") {
        const res = await campaignsApi.start(campaign.id);
        setCampaign(res.campaign);
        setNotice({ text: res.message, tone: "success", items: res.warnings });
      } else if (action === "pause") {
        const res = await campaignsApi.pause(campaign.id);
        setCampaign(res.campaign);
        setNotice({ text: res.message, tone: "info" });
      } else if (action === "cancel") {
        const res = await campaignsApi.cancel(campaign.id);
        setCampaign(res.campaign);
        setNotice({ text: res.message, tone: "info" });
      } else if (action === "delete") {
        await campaignsApi.remove(campaign.id);
        navigate("/super-admin/campaigns");
        return;
      } else {
        await campaignsApi.exportCsv(campaign.id);
      }
      setRefreshKey(k => k + 1);
    } catch (err) {
      const problems = err instanceof ApiError && err.payload && typeof err.payload === "object" && "problems" in err.payload
        ? (err.payload as { problems: string[] }).problems
        : undefined;
      setNotice({ text: err instanceof ApiError ? err.message : "Action failed", tone: "error", items: problems });
    } finally {
      setPending(null);
      setConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="skeleton-block" style={{ width: 280, height: 30, marginBottom: 20 }} />
        <div className="stats-grid-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton-block skeleton-stat" />)}</div>
        <div className="skeleton-block" style={{ height: 260, borderRadius: 14 }} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="dashboard-page">
        <Link to="/super-admin/campaigns" style={{ fontSize: "0.85rem", color: "var(--brand-blue)", textDecoration: "none" }}>← All campaigns</Link>
        <div className="form-status error" style={{ margin: "16px 0" }}>{error ?? "Campaign not found"}</div>
        <button className="dashboard-button" onClick={() => { setLoading(true); void load(); }}>Retry</button>
      </div>
    );
  }

  const stats = campaign.stats;
  const calls = stats?.calls;
  const byStatus = calls?.by_status ?? {};
  const editable = campaign.status === "draft" || campaign.status === "paused";
  const finished = campaign.status === "completed" || campaign.status === "cancelled";
  const days = WEEKDAYS.filter(d => campaign.call_days.includes(d.value)).map(d => d.label).join(", ");
  const windowText = `${hhmm(campaign.call_window_start)}–${hhmm(campaign.call_window_end)} ${days} (${campaign.timezone ?? "UTC"})`;

  return (
    <div className="dashboard-page">
      <Link to="/super-admin/campaigns" style={{ fontSize: "0.85rem", color: "var(--brand-blue)", textDecoration: "none", fontWeight: 600 }}>
        ← All campaigns
      </Link>

      <div className="page-hero" style={{ marginTop: 12 }}>
        <div>
          <h1>{campaign.name}</h1>
          <p className="page-subtitle">
            Calling from <strong>{campaign.from_number ?? "—"}</strong> · {windowText}
          </p>
        </div>
        <div className="page-hero-badges" style={{ gap: 8, flexWrap: "wrap" }}>
          <Badge tone={CAMPAIGN_STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
          {editable && (
            <button className="dashboard-button" disabled={!!pending} onClick={() => void run("start")}>
              {pending === "start" ? "Starting…" : campaign.status === "paused" ? "Resume" : "Start Calling"}
            </button>
          )}
          {isRunning && (
            <button className="dashboard-button-secondary" disabled={!!pending} onClick={() => void run("pause")}>
              {pending === "pause" ? "Pausing…" : "Pause"}
            </button>
          )}
          <button className="dashboard-button-secondary" disabled={!!pending || !campaign.total_contacts} onClick={() => void run("export")}>
            {pending === "export" ? "Exporting…" : "Export CSV"}
          </button>
          {!finished && (
            <button className="dashboard-button-secondary" disabled={!!pending} onClick={() => setConfirm("cancel")}>Cancel</button>
          )}
          {!isRunning && (
            <button className="dashboard-button-danger" disabled={!!pending} onClick={() => setConfirm("delete")}>Delete</button>
          )}
        </div>
      </div>

      {notice && (
        <div className={`form-status${notice.tone === "error" ? " error" : ""}`} style={{ marginBottom: 16 }}>
          {notice.text}
          {notice.items && notice.items.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{notice.items.map(item => <li key={item}>{item}</li>)}</ul>
          )}
        </div>
      )}
      {campaign.last_error && (
        <div className="form-status error" style={{ marginBottom: 16 }}>
          <strong>Last problem:</strong> {campaign.last_error}
        </div>
      )}
      {isRunning && campaign.in_call_window_now === false && (
        <div className="form-status" style={{ marginBottom: 16, background: "var(--info-bg)", borderColor: "var(--info-ring)", color: "var(--info-text)" }}>
          Outside calling hours right now — calls resume automatically at {hhmm(campaign.call_window_start)} ({campaign.timezone}).
        </div>
      )}

      <div className="stats-grid-4">
        <div className="stat-card" style={{ cursor: "default" }}>
          <div>
            <div className="stat-card-value">{(stats?.contacts ?? 0).toLocaleString()}</div>
            <div className="stat-card-label">Businesses</div>
            <div className="stat-card-meta">{byStatus.skipped ?? 0} skipped (no phone / do-not-call)</div>
          </div>
        </div>
        <div className="stat-card" style={{ cursor: "default" }}>
          <div>
            <div className="stat-card-value">{Math.round(stats?.progress_percent ?? 0)}%</div>
            <div className="stat-card-label">Progress</div>
            <div style={{ marginTop: 8 }}><ProgressBar percent={stats?.progress_percent ?? 0} /></div>
          </div>
        </div>
        <div className="stat-card" style={{ cursor: "default" }}>
          <div>
            <div className="stat-card-value">{calls?.answered_by_person ?? 0}</div>
            <div className="stat-card-label">Answered by a Person</div>
            <div className="stat-card-meta">{calls?.in_progress ?? 0} on a call right now</div>
          </div>
        </div>
        <div className="stat-card" style={{ cursor: "default" }}>
          <div>
            <div className="stat-card-value">{calls?.voicemail ?? 0}</div>
            <div className="stat-card-label">Voicemails Reached</div>
            <div className="stat-card-meta">{calls?.opted_out ?? 0} opted out</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatChip label="Completed" value={byStatus.completed ?? 0} color="#15803d" />
        <StatChip label="No answer" value={byStatus["no-answer"] ?? 0} />
        <StatChip label="Busy" value={byStatus.busy ?? 0} />
        <StatChip label="Failed" value={byStatus.failed ?? 0} color={byStatus.failed ? "#b91c1c" : undefined} />
        <StatChip label="Waiting / retry" value={byStatus.pending ?? 0} />
        {campaign.email_enabled && <StatChip label="Emails sent" value={stats?.emails.sent ?? 0} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, marginBottom: 20 }}>
        <CampaignAudioCard campaign={campaign} editable={editable} onChange={setCampaign} />
        <CampaignImportCard
          campaign={campaign}
          editable={editable}
          onImported={message => { setNotice({ text: message, tone: "success" }); void load(); setRefreshKey(k => k + 1); }}
        />
      </div>

      <CampaignSettingsForm campaign={campaign} editable={editable} onSaved={setCampaign} />

      <CampaignContactsTable campaignId={campaign.id} emailEnabled={campaign.email_enabled} refreshKey={refreshKey} />

      {confirm === "cancel" && (
        <ConfirmModal
          title="Cancel campaign"
          message={<>No more calls or emails will be sent for <strong>{campaign.name}</strong>. Calls already ringing will finish. This can't be undone.</>}
          confirmLabel="Cancel campaign"
          danger
          busy={pending === "cancel"}
          onConfirm={() => void run("cancel")}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <ConfirmModal
          title="Delete campaign"
          message={<>This permanently deletes <strong>{campaign.name}</strong>, its recording and all {campaign.total_contacts} call results. Export the CSV first if you need them.</>}
          confirmLabel="Delete"
          danger
          busy={pending === "delete"}
          onConfirm={() => void run("delete")}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
