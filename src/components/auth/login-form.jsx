"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 16px text keeps phones from zooming into the field; tall controls are easy to tap.
const field =
  "h-13 rounded-lg bg-muted/40 pl-11 text-base focus-visible:border-[#2c3654] focus-visible:bg-background focus-visible:ring-[#2c3654]/10 md:text-base dark:focus-visible:border-brand dark:focus-visible:ring-brand/20";
const icon =
  "pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground";

// Where to go after signing in: the admin page that sent the user here (never another site),
// otherwise the home page for their role.
function nextPage(home = "/admin") {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  return /^\/admin(?:[/?#]|$)/.test(next) ? next : home;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [going, setGoing] = useState(false);

  const emailOk = EMAIL.test(email.trim());

  async function submit(event) {
    event.preventDefault();
    if (going) return;
    if (!emailOk) {
      setError("Enter the email address you use for the portal.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setError("");
    setGoing(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        setError(body.error || "Couldn't sign you in. Try again.");
        setGoing(false);
        return;
      }
      router.replace(nextPage(body.home));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setGoing(false);
    }
  }

  function edit(setter) {
    return (event) => {
      setter(event.target.value);
      setError("");
    };
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 grid">
      <div className="grid gap-2">
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <Mail className={icon} aria-hidden="true" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={edit(setEmail)}
            placeholder="you@example.com"
            autoComplete="email"
            enterKeyHint="next"
            className={field}
            aria-invalid={error && !emailOk ? true : undefined}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <LockKeyhole className={icon} aria-hidden="true" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={edit(setPassword)}
            placeholder="Your password"
            autoComplete="current-password"
            enterKeyHint="go"
            className={`${field} pr-12`}
            aria-invalid={error && emailOk && !password ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-brand/40"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {/* Switched off for now; restore the mailto link below when password reset is ready.
          href="mailto:support@h2hexpress.com?subject=Portal%20password%20reset" */}
      <span
        aria-disabled="true"
        className="mt-3 cursor-not-allowed justify-self-end text-sm font-medium text-muted-foreground/60 select-none"
      >
        Forgot password?
      </span>

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
        {going ? "Signing in…" : "Sign in"}
        <span
          className="grid place-items-center text-brand transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          {going ? (
            <LoaderCircle className="size-4 animate-spin" strokeWidth={2.5} />
          ) : (
            <ArrowRight className="size-4" strokeWidth={2.5} />
          )}
        </span>
      </Button>
    </form>
  );
}
