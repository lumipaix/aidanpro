import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { tenantApi } from "@/features/tenant/api/tenantApi";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import { withRetry } from "@/shared/utils/withRetry";
import { apiCache, CACHE_KEYS } from "@/shared/cache/apiCache";
import type { TenantProfileResponse, TenantProfilePayload } from "@/features/tenant/api/tenantApi";
import {
  SUPPORTED_COUNTRIES,
  isRegionFieldRequired,
  regionFieldLabel,
  countryName
} from "@/shared/constants/supportedCountries";

const profileSchema = z
  .object({
    name: z.string().min(2, "Company name must be at least 2 characters"),
    timezone: z.string().min(1, "Timezone is required"),
    industry: z.string().min(1, "Industry is required"),
    default_email_recipients: z.string().min(1, "At least one email recipient is required"),
    // Business address — re-verified server-side whenever it changes.
    country: z.string().length(2, "Country is required"),
    address_line1: z.string().min(3, "Street address is required"),
    address_line2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().optional(),
    postal_code: z.string().min(3, "Postal / ZIP code is required")
  })
  .refine(
    (values) =>
      !isRegionFieldRequired(values.country) ||
      Boolean(values.state && values.state.trim()),
    { message: "State / province is required for this country.", path: ["state"] }
  );

type ProfileFormValues = z.infer<typeof profileSchema>;

const ADDRESS_FIELDS = [
  "country",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code"
] as const;

/** Map a loaded profile onto form values (also used to reset after save/cancel). */
function toFormValues(data: TenantProfileResponse): ProfileFormValues {
  const { tenant } = data;
  return {
    name: tenant.name,
    timezone: tenant.timezone,
    industry: tenant.industry,
    default_email_recipients: tenant.default_email_recipients.join(", "),
    country: tenant.country ?? "CA",
    address_line1: tenant.address_line1 ?? "",
    address_line2: tenant.address_line2 ?? "",
    city: tenant.city ?? "",
    state: tenant.state ?? "",
    postal_code: tenant.postal_code ?? ""
  };
}

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "Europe/Amsterdam", "Asia/Dubai", "Asia/Kolkata",
  "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"
];

const INDUSTRIES = [
  "Healthcare", "Real Estate", "Technology", "Finance & Banking",
  "Legal Services", "Retail & E-commerce", "Hospitality & Tourism",
  "Education", "Construction", "Manufacturing", "Insurance",
  "Consulting", "Non-profit", "Other"
];

const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconSave = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function TenantProfilePage() {
  const [profile, setProfile] = useState<TenantProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields }
  } = useForm<ProfileFormValues>({ resolver: zodResolver(profileSchema) });

  const selectedCountry = watch("country") ?? "CA";

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const loadProfile = async () => {
      // Return cached data immediately
      const cached = apiCache.get(CACHE_KEYS.tenantProfile);
      if (cached) {
        reset(toFormValues(cached));
        setProfile(cached);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await withRetry(() => tenantApi.getProfile(signal), signal);
        apiCache.set(CACHE_KEYS.tenantProfile, data);
        reset(toFormValues(data));
        setProfile(data);
      } catch (err) {
        if (isAbortError(err)) return;
        setFormError(err instanceof ApiError ? err.message : "Failed to load profile");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    void loadProfile();
    return () => controller.abort();
  }, [reset]);

  const onSubmit = async (values: ProfileFormValues) => {
    setFormMessage(null);
    setFormError(null);
    setSaving(true);
    try {
      const payload: TenantProfilePayload = {
        name: values.name,
        timezone: values.timezone,
        industry: values.industry,
        country: values.country,
        default_email_recipients: values.default_email_recipients
          .split(",").map((e) => e.trim()).filter(Boolean)
      };

      // Only send address fields when they actually changed — the server
      // re-verifies the address on every address write, so sending an
      // unchanged address would spend a verification call (and could block an
      // unrelated edit) for nothing.
      if (ADDRESS_FIELDS.some((field) => dirtyFields[field])) {
        payload.country = values.country;
        payload.address_line1 = values.address_line1;
        payload.address_line2 = values.address_line2 || undefined;
        payload.city = values.city;
        payload.state = values.state || undefined;
        payload.postal_code = values.postal_code;
      }

      const response = await tenantApi.updateProfile(payload);
      const updated = { ...profile!, tenant: response.tenant };
      apiCache.set(CACHE_KEYS.tenantProfile, updated);
      apiCache.delete(CACHE_KEYS.phoneNumbers); // dashboard re-reads profile
      setProfile(updated);
      reset(toFormValues(updated));
      setFormMessage("Profile updated successfully");
      setIsEditing(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (!profile) return;
    setIsEditing(false);
    setFormMessage(null);
    setFormError(null);
    reset(toFormValues(profile));
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="page-hero">
          <div>
            <div className="skeleton-block" style={{ width: 180, height: 26, marginBottom: 8 }} />
            <div className="skeleton-block" style={{ width: 120, height: 18 }} />
          </div>
        </div>
        <div className="skeleton-block" style={{ height: 200, borderRadius: 14 }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="dashboard-page">
        <div className="page-hero"><h1>Tenant Profile</h1></div>
        <div className="form-status error">Failed to load profile. Please refresh.</div>
      </div>
    );
  }

  const tenant = profile.tenant;
  const canEdit = profile.user_role === "owner" || profile.user_role === "admin";
  const addressVerified = Boolean(tenant.address_verified);
  const addressLines = [
    tenant.address_line1,
    tenant.address_line2,
    tenant.city,
    tenant.state,
    tenant.postal_code
  ].filter(Boolean) as string[];
  const hasAddress = addressLines.length > 0;
  const roleBadgeClass = profile.user_role === "owner"
    ? "badge-info"
    : profile.user_role === "admin"
    ? "badge-neutral"
    : "badge-neutral";

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="page-hero">
        <div>
          <h1>Tenant Profile</h1>
          <p className="page-subtitle">Company information and account settings</p>
        </div>
        <div className="page-hero-badges">
          <span className={`badge ${roleBadgeClass}`}>
            {profile.user_role}
          </span>
          <span className={`badge badge-${tenant.status === "active" ? "success" : "warning"}`}>
            <span className="badge-dot" />
            {tenant.status}
          </span>
        </div>
      </div>

      {formMessage && <div className="form-status" style={{ marginBottom: 16 }}>{formMessage}</div>}
      {formError   && <div className="form-status error" style={{ marginBottom: 16 }}>{formError}</div>}

      {!isEditing ? (
        /* ── Read-only view ── */
        <>
          <div className="detail-card">
            <div className="detail-card-header">
              <h2 className="detail-card-title">Company Details</h2>
              {canEdit && (
                <button onClick={() => setIsEditing(true)} className="dashboard-button">
                  <IconEdit /> Edit Profile
                </button>
              )}
            </div>
            <div className="detail-card-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Company Name</span>
                  <span className="detail-value">{tenant.name}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Industry</span>
                  <span className="detail-value">{tenant.industry || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Timezone</span>
                  <span className="detail-value">{tenant.timezone || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Account Status</span>
                  <span className="detail-value">
                    <span className={`badge badge-${tenant.status === "active" ? "success" : "warning"}`}>
                      <span className="badge-dot" />{tenant.status}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <h2 className="detail-card-title">Business Address</h2>
              <span className={`badge badge-${addressVerified ? "success" : "warning"}`}>
                <span className="badge-dot" />
                {addressVerified ? "Verified" : "Not verified"}
              </span>
            </div>
            <div className="detail-card-body">
              {hasAddress ? (
                <>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Address</span>
                      <span className="detail-value">
                        {tenant.address_formatted || addressLines.join(", ")}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Country</span>
                      <span className="detail-value">
                        {tenant.country ? countryName(tenant.country) : "—"}
                      </span>
                    </div>
                    {tenant.address_verified_at && (
                      <div className="detail-item">
                        <span className="detail-label">Verified On</span>
                        <span className="detail-value">
                          {new Date(tenant.address_verified_at).toLocaleDateString("en-US", {
                            year: "numeric", month: "long", day: "numeric"
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  {!addressVerified && (
                    <p style={{ margin: "12px 0 0", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                      This address has not been verified. Edit your profile and
                      save it to run verification again.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  No business address on file. Edit your profile to add one —
                  it is verified against postal records.
                </p>
              )}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <h2 className="detail-card-title">Call Report Recipients</h2>
            </div>
            <div className="detail-card-body">
              {tenant.default_email_recipients.length > 0 ? (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    After each call, a summary, transcript and recording link are emailed to:
                  </p>
                  <div className="detail-tags">
                    {tenant.default_email_recipients.map((email) => (
                      <span key={email} className="detail-tag">{email}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  No email recipients configured. Edit your profile to add recipients.
                </p>
              )}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <h2 className="detail-card-title">Account Information</h2>
            </div>
            <div className="detail-card-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Your Role</span>
                  <span className="detail-value">
                    <span className={`badge ${roleBadgeClass}`}>{profile.user_role}</span>
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Created</span>
                  <span className="detail-value">
                    {new Date(tenant.created_at).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric"
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── Edit form ── */
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-sections">
            <div className="form-section">
              <div className="form-section-header">
                <h2 className="form-section-title">Company Details</h2>
                <p className="form-section-desc">Basic information about your company</p>
              </div>
              <div className="form-section-body form-grid-2">
                <div className="form-field">
                  <label htmlFor="name">Company Name</label>
                  <input
                    id="name"
                    type="text"
                    {...register("name")}
                    placeholder="Acme Corp"
                  />
                  {errors.name && <small className="field-error">{errors.name.message}</small>}
                </div>

                <div className="form-field">
                  <label htmlFor="industry">Industry</label>
                  <select id="industry" className="form-field-select" {...register("industry")}>
                    <option value="">Select industry…</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                  {errors.industry && <small className="field-error">{errors.industry.message}</small>}
                </div>

                <div className="form-field">
                  <label htmlFor="timezone">Timezone</label>
                  <select id="timezone" className="form-field-select" {...register("timezone")}>
                    <option value="">Select timezone…</option>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  {errors.timezone && <small className="field-error">{errors.timezone.message}</small>}
                </div>

              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">
                <h2 className="form-section-title">Business Address</h2>
                <p className="form-section-desc">
                  Verified against postal records when saved. Available in North
                  America and Europe only.
                </p>
              </div>
              <div className="form-section-body form-grid-2">
                <div className="form-field">
                  <label htmlFor="country">Country</label>
                  <select id="country" className="form-field-select" {...register("country")}>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  {errors.country && <small className="field-error">{errors.country.message}</small>}
                </div>

                <div className="form-field">
                  <label htmlFor="address_line1">Street Address</label>
                  <input
                    id="address_line1"
                    type="text"
                    autoComplete="address-line1"
                    {...register("address_line1")}
                    placeholder="123 King Street West"
                  />
                  {errors.address_line1 && (
                    <small className="field-error">{errors.address_line1.message}</small>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="address_line2">Suite / Unit (optional)</label>
                  <input
                    id="address_line2"
                    type="text"
                    autoComplete="address-line2"
                    {...register("address_line2")}
                    placeholder="Suite 400"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="city">City</label>
                  <input
                    id="city"
                    type="text"
                    autoComplete="address-level2"
                    {...register("city")}
                    placeholder="Toronto"
                  />
                  {errors.city && <small className="field-error">{errors.city.message}</small>}
                </div>

                <div className="form-field">
                  <label htmlFor="state">
                    {regionFieldLabel(selectedCountry)}
                    {isRegionFieldRequired(selectedCountry) ? "" : " (optional)"}
                  </label>
                  <input
                    id="state"
                    type="text"
                    autoComplete="address-level1"
                    {...register("state")}
                    placeholder={selectedCountry === "CA" ? "ON" : "NY"}
                  />
                  {errors.state && <small className="field-error">{errors.state.message}</small>}
                </div>

                <div className="form-field">
                  <label htmlFor="postal_code">Postal / ZIP Code</label>
                  <input
                    id="postal_code"
                    type="text"
                    autoComplete="postal-code"
                    {...register("postal_code")}
                    placeholder="M5H 1A1"
                  />
                  {errors.postal_code && (
                    <small className="field-error">{errors.postal_code.message}</small>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-header">
                <h2 className="form-section-title">Call Report Recipients</h2>
                <p className="form-section-desc">
                  After each call, a summary and transcript are emailed to these addresses
                </p>
              </div>
              <div className="form-section-body">
                <div className="form-field">
                  <label htmlFor="default_email_recipients">Email Addresses</label>
                  <input
                    id="default_email_recipients"
                    type="text"
                    {...register("default_email_recipients")}
                    placeholder="admin@company.com, reports@company.com"
                  />
                  {errors.default_email_recipients && (
                    <small className="field-error">{errors.default_email_recipients.message}</small>
                  )}
                  <small style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Separate multiple emails with commas
                  </small>
                </div>
              </div>
            </div>

            <div className="dashboard-form-actions" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", marginTop: 0 }}>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="dashboard-button-secondary"
              >
                <IconX /> Cancel
              </button>
              <button type="submit" disabled={saving} className="dashboard-button">
                <IconSave /> {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
