"use client";
import { ArrowRight, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

export default function TideCloakSignIn({
  configured,
  error,
  onRetry,
}: {
  configured: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <main className="auth-page">
      <section className="panel auth-card" aria-labelledby="sign-in-title">
        <div className="brand">
          <span className="brand-mark">
            <ShieldCheck size={25} />
          </span>
          TrustVault
        </div>
        <div className="eyebrow">YOUR INFORMATION. YOUR DECISION.</div>
        <h1 id="sign-in-title">Sign in to your vault</h1>
        <p>
          Your documents, consent and activity belong to your verified account.
          Sign in through TideCloak to continue.
        </p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {configured ? (
          <a className="button primary full-width" href="/auth/login">
            Sign in with TideCloak <ArrowRight size={18} />
          </a>
        ) : (
          <>
            <div className="notice info" role="status">
              Sign-in is not ready on this website yet. The project operator
              needs to finish the TideCloak and storage setup.
            </div>
            <button className="button full-width" onClick={onRetry}>
              <RefreshCw size={16} /> Check again
            </button>
          </>
        )}
        <p className="auth-note">
          <LockKeyhole size={15} /> Your password is entered on TideCloak, never
          in this app.
        </p>
        <p className="footnote">
          Hackathon prototype. Use synthetic documents only.
        </p>
      </section>
    </main>
  );
}
