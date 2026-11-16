"use client";

import { useRef, useState } from "react";
import { Camera, Eye, EyeOff, LoaderCircle, LogOut, Trash2 } from "lucide-react";
import {
  changePassword,
  photoFromFile,
  removePhoto,
  saveName,
  signOut,
  uploadPhoto,
  useProfile,
} from "@/components/admin/profile-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PASSWORD_MIN = 8;

function Photo({ profile }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) run(async () => uploadPhoto(await photoFromFile(file)));
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-20 rounded-sm after:hidden">
        {profile.photo && <AvatarImage src={profile.photo} alt="Your profile picture" className="rounded-sm object-top" />}
        <AvatarFallback className="rounded-sm text-xl font-medium">{profile.initials}</AvatarFallback>
      </Avatar>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !profile.loaded}
            onClick={() => input.current?.click()}
          >
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
            {profile.photo ? "Change photo" : "Upload photo"}
          </Button>
          {profile.photo && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => run(removePhoto)}>
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={choose} />
        {error && (
          <p role="alert" className="text-sm text-status-bad">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Profile() {
  const profile = useProfile();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const name = draft ?? profile.name;
  const dirty = draft !== null && draft.trim() !== profile.name;

  async function submit(event) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Enter your name.");
      return;
    }
    setError("");
    setStatus("saving");
    try {
      await saveName(clean);
      setDraft(null);
      setStatus("saved");
    } catch (failure) {
      setError(failure.message);
      setStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.name || " "}</CardTitle>
        <CardDescription>{[profile.title, profile.email].filter(Boolean).join(" · ") || " "}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Photo profile={profile} />
        <form onSubmit={submit} noValidate className="grid gap-4 border-t pt-5">
          <div className="grid gap-1.5">
            <Label htmlFor="account-name">Full name</Label>
            <Input
              id="account-name"
              value={name}
              autoComplete="name"
              maxLength={80}
              disabled={!profile.loaded}
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                setDraft(event.target.value);
                setStatus("idle");
              }}
            />
            {error && (
              <p role="alert" className="text-sm text-status-bad">
                {error}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            {status === "saved" && !dirty && (
              <p role="status" className="text-sm text-status-good">
                Saved
              </p>
            )}
            <Button type="submit" disabled={!dirty || status === "saving"}>
              {status === "saving" ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordField({ id, label, value, onChange, error, autoComplete, shown }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
}

const NO_PASSWORDS = { currentPassword: "", newPassword: "", confirm: "" };

function Password() {
  const profile = useProfile();
  const [values, setValues] = useState(NO_PASSWORDS);
  const [errors, setErrors] = useState({});
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState("idle");
  const filled = values.currentPassword && values.newPassword && values.confirm;

  function edit(key) {
    return (value) => {
      setValues((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
      setStatus("idle");
    };
  }

  async function submit(event) {
    event.preventDefault();
    const found = {};
    if (!values.currentPassword) found.currentPassword = "Enter your current password.";
    if (values.newPassword.length < PASSWORD_MIN) found.newPassword = `Use at least ${PASSWORD_MIN} characters.`;
    else if (values.newPassword === values.currentPassword) found.newPassword = "Choose a password you aren't using now.";
    if (values.confirm !== values.newPassword) found.confirm = "The passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length) return;

    setStatus("saving");
    try {
      await changePassword(values.currentPassword, values.newPassword);
      setValues(NO_PASSWORDS);
      setShown(false);
      setStatus("saved");
    } catch (failure) {
      setErrors({ [failure.field ?? "form"]: failure.message });
      setStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Changing it signs you out on your other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          {/* Lets password managers match the new password to this account. */}
          <input type="text" autoComplete="username" value={profile.email} readOnly hidden />
          <PasswordField
            id="account-current-password"
            label="Current password"
            value={values.currentPassword}
            onChange={edit("currentPassword")}
            error={errors.currentPassword}
            autoComplete="current-password"
            shown={shown}
          />
          <PasswordField
            id="account-new-password"
            label="New password"
            value={values.newPassword}
            onChange={edit("newPassword")}
            error={errors.newPassword}
            autoComplete="new-password"
            shown={shown}
          />
          <PasswordField
            id="account-confirm-password"
            label="Confirm new password"
            value={values.confirm}
            onChange={edit("confirm")}
            error={errors.confirm}
            autoComplete="new-password"
            shown={shown}
          />
          {errors.form && (
            <p role="alert" className="text-sm text-status-bad">
              {errors.form}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShown((value) => !value)}>
              {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              {shown ? "Hide passwords" : "Show passwords"}
            </Button>
            <div className="flex items-center gap-3">
              {status === "saved" && (
                <p role="status" className="text-sm text-status-good">
                  Password changed
                </p>
              )}
              <Button type="submit" disabled={!filled || status === "saving"}>
                {status === "saving" ? "Changing…" : "Change password"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SignOut() {
  const [going, setGoing] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign out</CardTitle>
        <CardDescription>You&apos;ll go back to the login page.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          disabled={going}
          onClick={() => {
            setGoing(true);
            signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          {going ? "Signing out…" : "Sign out"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function AccountView() {
  return (
    <div className="grid gap-5">
      <Profile />
      <Password />
      <SignOut />
    </div>
  );
}
