import { useEffect, useRef, useState } from "react";
import { campaignsApi } from "@/features/super-admin/api/campaignsApi";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { prepareRecording } from "@/features/super-admin/utils/audioToWav";
import { fmtBytes } from "@/features/super-admin/utils/campaignFormat";
import type { Campaign } from "@/features/super-admin/api/campaignsApi";

type Message = { text: string; ok: boolean } | null;

export function CampaignAudioCard({ campaign, editable, onChange }: {
  campaign: Campaign;
  editable: boolean;
  onChange: (campaign: Campaign) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<Message>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<Message>(null);

  useEffect(() => {
    if (!campaign.has_audio) { setAudioUrl(null); return; }
    const controller = new AbortController();
    campaignsApi.getAudio(campaign.id, controller.signal)
      .then(res => setAudioUrl(res.url))
      .catch(err => { if (!isAbortError(err)) setAudioUrl(null); });
    return () => controller.abort();
  }, [campaign.id, campaign.has_audio, campaign.audio_file_name, campaign.audio_size_bytes]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadMsg(null);
    try {
      setUploading("Preparing audio…");
      const prepared = await prepareRecording(file);
      setUploading("Uploading…");
      const res = await campaignsApi.uploadAudio(campaign.id, prepared.blob, prepared.filename);
      onChange(res.campaign);
      setUploadMsg({
        ok: true,
        text: prepared.converted
          ? `Converted to WAV for phone playback (${Math.round(prepared.durationSeconds ?? 0)} s) and uploaded.`
          : "Recording uploaded."
      });
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const placeTestCall = async () => {
    try {
      setTesting(true);
      setTestMsg(null);
      const res = await campaignsApi.testCall(campaign.id, testPhone.trim());
      setTestMsg({ ok: true, text: `Calling ${res.to} from ${res.from} — answer to hear the message.` });
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof ApiError ? err.message : "Test call failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="detail-card" style={{ marginBottom: 0 }}>
      <div className="detail-card-header">
        <h2 className="detail-card-title">1 · Recorded Message</h2>
        {campaign.has_audio
          ? <span className="badge badge-success"><span className="badge-dot" />Ready</span>
          : <span className="badge badge-warning"><span className="badge-dot" />Missing</span>}
      </div>
      <div className="detail-card-body" style={{ display: "grid", gap: 16 }}>
        {campaign.has_audio ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.85rem", marginBottom: 8 }}>
              <strong style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{campaign.audio_file_name}</strong>
              <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtBytes(campaign.audio_size_bytes)}</span>
            </div>
            {audioUrl
              ? <audio controls preload="none" src={audioUrl} style={{ width: "100%" }} />
              : <div className="skeleton-block" style={{ height: 40, borderRadius: 8 }} />}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
            Upload the message every business will hear when they pick up (or on their voicemail).
          </p>
        )}

        {editable ? (
          <div>
            <input ref={fileInput} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.aiff,.ogg,.webm" style={{ display: "none" }}
              onChange={e => void handleFile(e.target.files?.[0])} />
            <button className="dashboard-button-secondary" disabled={!!uploading} onClick={() => fileInput.current?.click()}>
              {uploading ?? (campaign.has_audio ? "Replace recording" : "Upload recording")}
            </button>
            <p style={{ margin: "8px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              MP3 or WAV is used as-is. Other formats (e.g. an iPhone voice memo) are converted in your browser. Max 10 MB.
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>Pause the campaign to replace the recording.</p>
        )}
        {uploadMsg && <div className={`form-status${uploadMsg.ok ? "" : " error"}`}>{uploadMsg.text}</div>}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <label className="field-label">Test call — hear exactly what businesses will hear
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field-input" placeholder="Your phone, e.g. +1 204 555 0142" value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && testPhone.trim() && campaign.has_audio && !testing) void placeTestCall(); }} />
              <button className="dashboard-button" style={{ whiteSpace: "nowrap" }}
                disabled={testing || !testPhone.trim() || !campaign.has_audio} onClick={() => void placeTestCall()}>
                {testing ? "Calling…" : "Call me"}
              </button>
            </div>
          </label>
          {testMsg && <div className={`form-status${testMsg.ok ? "" : " error"}`} style={{ marginTop: 10 }}>{testMsg.text}</div>}
        </div>
      </div>
    </div>
  );
}
