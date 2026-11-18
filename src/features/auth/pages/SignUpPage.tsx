import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { FormField } from "@/features/auth/components/FormField";
import { AuthFormActions } from "@/features/auth/components/AuthFormActions";
import {
  SignUpFormValues,
  signUpSchema
} from "@/features/auth/schemas/authSchemas";
import { authApi } from "@/features/auth/api/authApi";
import { authSession } from "@/shared/session/authSession";
import { ApiError, isAbortError } from "@/shared/api/httpClient";
import {
  SUPPORTED_COUNTRIES,
  isRegionFieldRequired,
  regionFieldLabel,
  type SupportedCountry
} from "@/shared/constants/supportedCountries";

export function SignUpPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [countries, setCountries] = useState<SupportedCountry[]>(SUPPORTED_COUNTRIES);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      companyName: "",
      timezone: "America/Toronto",
      industry: "",
      country: "CA",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  const selectedCountry = watch("country");

  // The backend is the authority on which regions may sign up; fall back to the
  // bundled list if it is unreachable (e.g. cold start).
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await authApi.supportedCountries(controller.signal);
        if (data.countries?.length) setCountries(data.countries);
      } catch (error) {
        if (!isAbortError(error)) {
          // Keep the bundled fallback list.
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const onSubmit = async (values: SignUpFormValues) => {
    setFormError(null);
    try {
      const response = await authApi.signUp({
        email: values.email,
        password: values.password,
        company_name: values.companyName,
        timezone: values.timezone,
        industry: values.industry,
        country: values.country,
        address_line1: values.addressLine1,
        address_line2: values.addressLine2 || undefined,
        city: values.city,
        state: values.state || undefined,
        postal_code: values.postalCode
      });

      if (response.session?.access_token) {
        authSession.setTokens({
          accessToken: response.session.access_token,
          refreshToken: response.session.refresh_token,
          expiresAt: response.session.expires_at
        });
        reset();
        navigate("/auth/login");
      } else {
        setFormError("Invalid response from server. Missing access token.");
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Unable to create account.";
      setFormError(message);
    }
  };

  const groupedCountries = countries.reduce<Record<string, SupportedCountry[]>>(
    (acc, country) => {
      (acc[country.region] ??= []).push(country);
      return acc;
    },
    {}
  );

  return (
    <AuthCard
      title="Create Account"
      subtitle="Create your account to get started."
      footer={
        <p>
          Already have an account? <Link to="/auth/login">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
        {formError ? <p className="form-status error">{formError}</p> : null}
        <FormField
          id="companyName"
          label="Company Name"
          placeholder="Acme Corp"
          autoComplete="organization"
          error={errors.companyName?.message}
          {...register("companyName")}
        />
        <FormField
          id="timezone"
          label="Timezone"
          placeholder="America/Toronto"
          error={errors.timezone?.message}
          {...register("timezone")}
        />
        <FormField
          id="industry"
          label="Industry"
          placeholder="Healthcare"
          error={errors.industry?.message}
          {...register("industry")}
        />

        <div className="form-field">
          <label htmlFor="country">Country</label>
          <select id="country" className="form-field-select" {...register("country")}>
            {Object.entries(groupedCountries).map(([region, list]) => (
              <optgroup key={region} label={region}>
                {list.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {errors.country ? (
            <small className="field-error">{errors.country.message}</small>
          ) : (
            <small style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Available in North America and Europe, where we can verify a
              business address.
            </small>
          )}
        </div>

        <FormField
          id="addressLine1"
          label="Street Address"
          placeholder="123 King Street West"
          autoComplete="address-line1"
          error={errors.addressLine1?.message}
          {...register("addressLine1")}
        />
        <FormField
          id="addressLine2"
          label="Suite / Unit (optional)"
          placeholder="Suite 400"
          autoComplete="address-line2"
          error={errors.addressLine2?.message}
          {...register("addressLine2")}
        />
        <FormField
          id="city"
          label="City"
          placeholder="Toronto"
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register("city")}
        />
        <FormField
          id="state"
          label={`${regionFieldLabel(selectedCountry)}${
            isRegionFieldRequired(selectedCountry) ? "" : " (optional)"
          }`}
          placeholder={selectedCountry === "CA" ? "ON" : "NY"}
          autoComplete="address-level1"
          error={errors.state?.message}
          {...register("state")}
        />
        <FormField
          id="postalCode"
          label="Postal / ZIP Code"
          placeholder="M5H 1A1"
          autoComplete="postal-code"
          error={errors.postalCode?.message}
          {...register("postalCode")}
        />

        <FormField
          id="email"
          label="Work Email"
          type="email"
          placeholder="admin@company.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          placeholder="Create a strong password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <FormField
          id="confirmPassword"
          label="Confirm Password"
          type="password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <AuthFormActions submitLabel="Create account" isSubmitting={isSubmitting} />
      </form>
    </AuthCard>
  );
}
