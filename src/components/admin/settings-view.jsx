"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { saveExchangeRates, useExchangeRates } from "@/components/admin/exchange-store";
import { useProfile } from "@/components/admin/profile-store";
import { can } from "@/lib/permissions";
import { saveSettings, useSettings } from "@/components/admin/settings-store";
import { setTheme, useTheme } from "@/components/admin/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BUSINESS_FIELDS = [
  { key: "name", label: "Business name", type: "text", autoComplete: "organization" },
  { key: "phone", label: "Customer support phone", type: "tel", autoComplete: "tel" },
  { key: "email", label: "Customer support email", type: "email", autoComplete: "email" },
  { key: "website", label: "Website", type: "url", placeholder: "https://", autoComplete: "url" },
];

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor, detail: "Follows this device" },
];

function SettingsCard({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SaveRow({ saved, dirty, busy = false, error = "" }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t pt-4">
      {error ? (
        <p role="alert" className="mr-auto text-sm text-status-bad">
          {error}
        </p>
      ) : (
        saved &&
        !dirty && (
          <p role="status" className="text-sm text-status-good">
            Saved
          </p>
        )
      )}
      <Button type="submit" disabled={!dirty || busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

// Drafts sit on top of what's stored, so stored values show once they've loaded from the server.
function useDraft(stored) {
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const values = { ...stored, ...draft };
  const dirty = Object.entries(draft).some(([key, value]) => stored[key] !== value);

  return {
    values,
    dirty,
    saved,
    busy,
    error,
    change(key, value) {
      setDraft((current) => ({ ...current, [key]: value }));
      setSaved(false);
      setError("");
    },
    // Saves through the server; a refusal keeps the draft and shows why.
    async save(action) {
      setBusy(true);
      setError("");
      try {
        await action();
        setDraft({});
        setSaved(true);
        return true;
      } catch (failure) {
        setError(failure.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}

function BusinessProfile() {
  const settings = useSettings();
  const form = useDraft(settings.business);
  const [errors, setErrors] = useState({});

  function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(
      Object.entries(form.values).map(([key, value]) => [key, value.trim()]),
    );
    const found = {};
    if (!values.name) found.name = "Enter your business name.";
    if (values.email && !EMAIL.test(values.email)) found.email = "Enter a valid email address.";
    if (values.website && !URL.canParse(values.website)) {
      found.website = "Enter a full address, e.g. https://h2hexpress.com";
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    form.save(() => saveSettings({ business: values }));
  }

  return (
    <SettingsCard
      title="Business profile"
      description="How your business is named and how customers reach you."
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {BUSINESS_FIELDS.map(({ key, label, ...props }) => {
            const id = `business-${key}`;
            return (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  value={form.values[key]}
                  onChange={(event) => form.change(key, event.target.value)}
                  aria-invalid={errors[key] ? true : undefined}
                  aria-describedby={errors[key] ? `${id}-error` : undefined}
                  {...props}
                />
                {errors[key] && (
                  <p id={`${id}-error`} className="text-xs text-status-bad">
                    {errors[key]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <SaveRow saved={form.saved} dirty={form.dirty} busy={form.busy} error={form.error} />
      </form>
    </SettingsCard>
  );
}

function PackageRules() {
  const settings = useSettings();
  const form = useDraft({
    pickupReminderDays: String(settings.pickupReminderDays),
    requirePaymentBeforeDelivery: settings.requirePaymentBeforeDelivery,
  });
  const [error, setError] = useState("");
  const days = Number(form.values.pickupReminderDays);

  function submit(event) {
    event.preventDefault();
    if (!Number.isInteger(days) || days < 1 || days > 60) {
      setError("Enter a whole number of days from 1 to 60.");
      return;
    }
    setError("");
    form.save(() => saveSettings({ pickupReminderDays: days }));
  }

  return (
    <SettingsCard
      title="Packages and payments"
      description="Rules staff follow when moving packages along."
    >
      <form onSubmit={submit} noValidate className="grid gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="pickup-days">Flag packages waiting at pickup after</Label>
          <div className="flex items-center gap-2">
            <Input
              id="pickup-days"
              type="number"
              inputMode="numeric"
              min="1"
              max="60"
              step="1"
              className="w-24 font-mono"
              value={form.values.pickupReminderDays}
              onChange={(event) => form.change("pickupReminderDays", event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "pickup-days-error" : "pickup-days-hint"}
            />
            <span className="text-sm text-muted-foreground">{days === 1 ? "day" : "days"}</span>
          </div>
          {error ? (
            <p id="pickup-days-error" className="text-xs text-status-bad">
              {error}
            </p>
          ) : (
            <p id="pickup-days-hint" className="text-xs text-muted-foreground">
              These show in red on the Ready for pickup card on the Packages page.
            </p>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked disabled className="mt-0.5" />
          <span>
            <span className="block font-medium">Require full payment before delivery</span>
            <span className="block text-xs text-muted-foreground">
              Always on. Staff collect any balance due at pickup before the package is marked
              delivered.
            </span>
          </span>
        </label>

        <SaveRow saved={form.saved} dirty={form.dirty} busy={form.busy} error={form.error} />
      </form>
    </SettingsCard>
  );
}

const CUSTOMER_EMAILS = [
  { key: "departed", label: "In transit", hint: "When the package's box is dispatched." },
  { key: "pickup", label: "Ready for pickup", hint: "When the box is received at the destination branch. Includes any balance due." },
  { key: "delivered", label: "Delivered", hint: "When the package is handed over to the receiver." },
  { key: "lost", label: "Lost or damaged", hint: "When a missing package is closed as lost, or a damaged one as destroyed. Mentions any refund." },
];

function CustomerEmails() {
  const settings = useSettings();
  const form = useDraft(settings.customerEmails);

  function submit(event) {
    event.preventDefault();
    form.save(() => saveSettings({ customerEmails: form.values }));
  }

  return (
    <SettingsCard
      title="Customer emails"
      description="Emails the sender and receiver get as their package moves, when they gave an email address. Each is sent once per package."
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        {CUSTOMER_EMAILS.map((item) => (
          <label key={item.key} className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={form.values[item.key]}
              onCheckedChange={(checked) => form.change(item.key, checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.hint}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Emails go out through the mail server set up for the portal (SMTP). Without it, nothing is sent.
        </p>
        <SaveRow saved={form.saved} dirty={form.dirty} busy={form.busy} error={form.error} />
      </form>
    </SettingsCard>
  );
}

function Appearance() {
  const theme = useTheme();

  return (
    <SettingsCard title="Appearance" description="Applies right away, on this device only.">
      <RadioGroup
        value={theme}
        onValueChange={setTheme}
        aria-label="Theme"
        className="grid gap-2 sm:grid-cols-3"
      >
        {THEMES.map(({ value, label, icon: Icon, detail }) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm has-data-[state=checked]:border-ring has-data-[state=checked]:bg-accent/40"
          >
            <RadioGroupItem value={value} />
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="block font-medium">{label}</span>
              {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
            </span>
          </label>
        ))}
      </RadioGroup>
    </SettingsCard>
  );
}

const RATE_FIELDS = [
  { key: "ETB", id: "cad-etb", label: "1 CAD equals (ETB)" },
  { key: "UGX", id: "cad-ugx", label: "1 CAD equals (UGX)" },
];

function ExchangeRate() {
  const stored = useExchangeRates();
  const [draft, setDraft] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const valueOf = (key) => draft[key] ?? (stored[key] ? String(stored[key]) : "");
  const dirty = RATE_FIELDS.some(({ key }) => draft[key] !== undefined && Number(draft[key]) !== (stored[key] ?? 0));

  async function submit(event) {
    event.preventDefault();
    const changed = RATE_FIELDS.filter(({ key }) => draft[key] !== undefined && draft[key] !== "");
    if (!changed.length || changed.some(({ key }) => !(Number(draft[key]) > 0))) {
      return setError("Enter how much local money one Canadian dollar buys.");
    }
    try {
      await saveExchangeRates(Object.fromEntries(changed.map(({ key }) => [key.toLowerCase(), Number(draft[key])])));
      setError("");
      setDraft({});
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <SettingsCard
      title="Currency exchange"
      description="Set by the owner. Packages are collected at pickup in the destination's currency: Birr in Ethiopia, Canadian dollars in Canada, Uganda shillings in Uganda."
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {RATE_FIELDS.map(({ key, id, label }) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              inputMode="decimal"
              type="number"
              min="0"
              step="any"
              value={valueOf(key)}
              aria-invalid={Boolean(error)}
              onChange={(event) => {
                setDraft({ ...draft, [key]: event.target.value });
                setSaved(false);
              }}
            />
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-status-bad">
            {error}
          </p>
        )}
        <SaveRow saved={saved} dirty={dirty} />
      </form>
    </SettingsCard>
  );
}

export function SettingsView() {
  const profile = useProfile();
  return (
    <div className="grid gap-5">
      <BusinessProfile />
      {can(profile, "exchange.manage") && <ExchangeRate />}
      <PackageRules />
      <CustomerEmails />
      <Appearance />
    </div>
  );
}
