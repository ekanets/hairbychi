import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiRequestError } from "../../api/client";
import { adminLogin, adminLoginBackupCode } from "../../api/endpoints";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { errorMessage } from "../../lib/errors";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/form";
import Logo from "../../ui/Logo";
import Photo from "../../ui/Photo";

const APP_ENV = import.meta.env.VITE_APP_ENV || "development";

export default function StudioLogin() {
  const nav = useNavigate();
  const { isAuthenticated, isLoading, login } = useAdminAuth();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) return <Navigate to="/studio" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = mode === "totp" ? await adminLogin(code.trim()) : await adminLoginBackupCode(code.trim());
      login(res.session_token);
      nav("/studio", { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? errorMessage(err.code, err.message) : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <Photo path="auth" art="wig" tone="gold" alt="" className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent" aria-hidden />
        <p className="absolute right-12 bottom-12 left-12 font-display text-5xl leading-tight text-ivory">
          Studio access for <em className="text-gold">Hair by Chi.</em>
        </p>
      </div>
      <div className="flex items-center justify-center bg-ivory px-5 py-14">
        <div className="w-full max-w-md">
          {APP_ENV === "staging" ? (
            <p className="mb-6 rounded-full bg-gold py-1.5 text-center text-xs font-semibold tracking-[0.2em] text-ink uppercase">STAGING — not live</p>
          ) : null}
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-5xl">Studio sign in</h1>
          <p className="mt-2 text-muted">{mode === "totp" ? "Enter the code from your authenticator app." : "Enter a one-time backup code."}</p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
            <Input
              label={mode === "totp" ? "Authenticator code" : "Backup code"}
              inputMode={mode === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={mode === "totp" ? "123456" : "XXXX-XXXX"}
            />
            {error ? (
              <p className="rounded-xl bg-error-soft p-3 text-sm text-error" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" loading={submitting}>
              Sign in
            </Button>
          </form>
          <button
            type="button"
            className="mt-6 text-sm font-semibold underline decoration-gold underline-offset-4"
            onClick={() => {
              setMode(mode === "totp" ? "backup" : "totp");
              setCode("");
              setError("");
            }}
          >
            {mode === "totp" ? "Use a backup code instead" : "Use my authenticator app instead"}
          </button>
        </div>
      </div>
    </div>
  );
}
