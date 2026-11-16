"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PASSWORD_MIN = 8;

const field =
  "h-13 rounded-lg bg-muted/40 pl-11 text-base focus-visible:border-[#2c3654] focus-visible:bg-background focus-visible:ring-[#2c3654]/10 md:text-base dark:focus-visible:border-brand dark:focus-visible:ring-brand/20";
const icon =
  "pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground";

// Read once, then dropped from the address bar so the link isn't left in history or screenshots.
// Kept here so a second effect run (React's dev double-mount) still has it.
let pageToken = "";

function takeToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (token) {
    pageToken = token;
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  return pageToken;
}

async function checkInvite(token) {
  if (!token) return { status: "invalid", error: "This page needs the link from your invitation email." };
  try {
    const response = await fetch(`/api/invite?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await response.json();
    return body.success ? { status: "ready", invite: body.invite } : { status: "invalid", error: body.error };
  } catch {
    return { status: "invalid", error: "Couldn't reach the server. Check your connection and reload." };
  }
}

export function ActivateForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [state, setState] = useState({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");
  const [going, setGoing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const found = takeToken();
    checkInvite(found).then((next) => {
      if (cancelled) return;
      setToken(found);
      setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (going) return;
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (confirm !== password) {
      setError("The passwords don't match.");
      return;
    }
    setError("");
    setGoing(true);
    try {
      const response = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        if (response.status === 410) setState({ status: "invalid", error: body.error });
        else setError(body.error || "Couldn't activate your account. Try again.");
        setGoing(false);
        return;
      }
      router.replace(body.home || "/admin");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setGoing(false);
    }
  }

  if (state.status === "checking") {
    return (
      <p role="status" className="mt-8 flex items-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Checking your invitation…
      </p>
    );
  }

  if (state.status === "invalid") {
    return (
      <div className="mt-8 grid gap-5">
        <p role="alert" className="rounded-lg border border-status-bad/30 bg-status-bad/5 p-4 text-sm">
          {state.error}
        </p>
        <Button asChild variant="outline" size="lg" className="h-12">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  const { invite } = state;
  return (
    <>
      <p className="mt-5 text-muted-foreground">
        Hi {invite.name}, you&apos;ve been invited to the {invite.company} portal. Set a password to
        activate your account.
      </p>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate font-medium">{invite.email}</dd>
        <dt className="text-muted-foreground">Role</dt>
        <dd className="font-medium">{invite.role}</dd>
        <dt className="text-muted-foreground">Branch</dt>
        <dd className="font-medium">{invite.branch}</dd>
      </dl>

      <form onSubmit={submit} noValidate className="mt-6 grid">
        {/* Lets password managers save the new password against this email. */}
        <input type="email" autoComplete="username" value={invite.email} readOnly hidden />
        <div className="grid gap-2">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <LockKeyhole className={icon} aria-hidden="true" />
            <Input
              id="new-password"
              type={shown ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              placeholder={`At least ${PASSWORD_MIN} characters`}
              autoComplete="new-password"
              className={`${field} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShown((value) => !value)}
              className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-brand/40"
              aria-label={shown ? "Hide passwords" : "Show passwords"}
            >
              {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <div className="relative">
            <LockKeyhole className={icon} aria-hidden="true" />
            <Input
              id="confirm-password"
              type={shown ? "text" : "password"}
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setError("");
              }}
              placeholder="Type it again"
              autoComplete="new-password"
              enterKeyHint="go"
              className={field}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={going}
          aria-busy={going}
          className="group mt-6 h-14 rounded-md bg-neutral-700 font-loading text-base font-semibold text-brand shadow-sm hover:bg-neutral-600"
        >
          {going ? "Activating…" : "Activate account"}
          <span className="grid place-items-center text-brand" aria-hidden="true">
            {going ? (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <ArrowRight className="size-4" strokeWidth={2.5} />
            )}
          </span>
        </Button>
      </form>
    </>
  );
}
