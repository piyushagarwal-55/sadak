"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import posthog from "posthog-js";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const IS_DEV = process.env.NODE_ENV === "development";


/**
 * Where a magic link comes back to.
 *
 * This used to be `window.location.origin` alone, which stamps the link with
 * whatever host you happened to ask from. Ask while a dev server is open and
 * the email points at localhost:3000 forever — the target is baked into the
 * link when it is sent, so it cannot be repaired afterwards, and clicking it
 * later gives ERR_CONNECTION_REFUSED once that server is gone.
 *
 * `NEXT_PUBLIC_SITE_URL` is set on every deployed build and deliberately unset
 * locally, so production links always come back to production and local ones
 * still come back to localhost. Supabase's own Site URL setting never enters
 * into it: it is only consulted when no redirect is supplied, and one always is.
 */
function authRedirectPath(next: string | null): string {
  const path = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, "");
  return `${origin}/auth/callback?next=${encodeURIComponent(path)}`;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const authError = searchParams.get("error") === "auth";
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const [email, setEmail] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("");
  const [busy, setBusy] = useState<"magic" | "password" | "guest" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);


  /**
   * WALK IN WITHOUT AN ACCOUNT.
   *
   * Supabase's anonymous sign-in, not a bypass: it mints a real session with a
   * real `auth.uid()`, so every row-level-security policy, the progress table
   * and the leaderboard keep working exactly as they do for a signed-in player.
   * Nothing downstream needs to know the difference, which is the whole reason
   * to do it this way rather than punching a hole in the middleware.
   *
   * It exists because the first thing a judge meets should be a street, not a
   * sign-up form. Anyone who decides to keep their progress can link an email
   * to the same account afterwards; the uid does not change.
   */
  async function continueAsGuest() {
    setFormError(null);
    setMessage(null);
    setBusy("guest");
    posthog.capture("sign_in_attempted", { method: "guest" });
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Anonymous sign-ins are off by default on a Supabase project, and the
      // raw message ("Anonymous sign-ins are disabled") reads like a bug in
      // this button rather than a setting nobody has turned on yet.
      setFormError(
        /anonymous/i.test(error.message)
          ? "Guest access is switched off for this project. Enable Anonymous sign-ins in Supabase under Authentication → Sign In / Providers."
          : error.message
      );
      setBusy(null);
      return;
    }
    router.push(safeNext);
    router.refresh();
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    setBusy("magic");
    posthog.capture("sign_in_attempted", { method: "magic_link" });
    const redirectTo = authRedirectPath(next);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });
    setBusy(null);
    if (error) {
      setFormError(error.message);
      return;
    }
    setMessage("Check your email for a sign-in link.");
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = devEmail.trim();
    if (!trimmedEmail || !devPassword) return;
    setFormError(null);
    setMessage(null);
    setBusy("password");
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: devPassword,
    });
    if (error) {
      setFormError(error.message);
      setBusy(null);
      return;
    }
    router.push(safeNext);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-baseline gap-2">
        <span className="font-indic text-2xl font-heading" lang="hi">
          सड़क
        </span>
        <h1 className="text-3xl font-heading tracking-tight">sadak</h1>
      </div>
      <p className="mt-3 text-sm text-foreground/70">
        A third-person street across ten Indian languages. Sign in to walk it.
      </p>

      {authError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>The link may have expired. Try again below.</AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Card className="mt-8 gap-0 py-5">
          <CardContent className="px-5">
            <div className="mb-3 flex size-10 items-center justify-center rounded-base border-2 border-border bg-main/20 text-foreground">
              <Mail size={20} strokeWidth={2} />
            </div>
            <h2 className="font-heading text-xl">Check your email</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">{message}</p>
            <Button
              type="button"
              variant="neutral"
              size="sm"
              className="mt-4"
              onClick={() => {
                setMessage(null);
                setEmail("");
              }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          <Button
            type="button"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void continueAsGuest()}
          >
            {busy === "guest" ? "Opening the street…" : "Continue as guest"}
          </Button>
          <p className="-mt-2 text-xs text-foreground/60">
            No account needed. Your progress is kept on this device.
          </p>

          <div className="relative text-center text-sm text-foreground/70">
            <span className="bg-background px-2 relative z-10">or</span>
            <div className="absolute inset-x-0 top-1/2 border-t border-border" aria-hidden />
          </div>

          <form className="flex flex-col gap-3" onSubmit={(e) => void sendMagicLink(e)}>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-heading">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-foreground shadow-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="you@example.com"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy !== null || !email.trim()}>
              {busy === "magic" ? "Sending…" : "Email me a magic link"}
            </Button>
          </form>

          {IS_DEV ? (
            <>
              <div className="relative text-center text-sm text-foreground/70">
                <span className="bg-background px-2 relative z-10 uppercase tracking-widest text-[11px] font-heading">
                  development only
                </span>
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden />
              </div>

              <form
                className="flex flex-col gap-3 rounded-base border-2 border-dashed border-border p-3"
                onSubmit={(e) => void signInWithPassword(e)}
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-heading">Email</span>
                  <input
                    type="email"
                    name="dev-email"
                    autoComplete="email"
                    required
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-foreground shadow-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-heading">Password</span>
                  <input
                    type="password"
                    name="dev-password"
                    autoComplete="current-password"
                    required
                    value={devPassword}
                    onChange={(e) => setDevPassword(e.target.value)}
                    className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-foreground shadow-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Password"
                  />
                </label>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy !== null || !devEmail.trim() || !devPassword}
                >
                  {busy === "password" ? "Signing in…" : "Sign in with password"}
                </Button>
              </form>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
