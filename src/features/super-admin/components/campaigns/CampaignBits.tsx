import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
      <div className="setup-progress-bar-bg">
        <div className="setup-progress-bar-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", minWidth: 38, textAlign: "right" }}>
        {Math.round(percent)}%
      </span>
    </div>
  );
}

export function StatChip({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ flex: "1 1 110px", padding: "12px 16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", minWidth: 100 }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: color ?? "var(--text-primary)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export function ConfirmModal({
  title, message, confirmLabel, danger, busy, onConfirm, onClose
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sa-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sa-modal sa-modal-sm">
        <div className="sa-modal-header">
          <h2 className="sa-modal-title" style={danger ? { color: "#b91c1c" } : undefined}>{title}</h2>
          <button className="sa-modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="sa-modal-body">
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{message}</div>
        </div>
        <div className="sa-modal-footer">
          <button className="dashboard-button-secondary" onClick={onClose} disabled={busy}>Back</button>
          <button className={danger ? "dashboard-button-danger" : "dashboard-button"} disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
