"use client";

import { useState } from "react";
import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { resetShippingRates, useShippingRates } from "@/components/admin/pricing-store";
import { resetRoutes, useRoutes } from "@/components/admin/routes-store";
import {
  DEFAULT_SETTINGS,
  resetSettings,
  saveSettings,
  useSettings,
} from "@/components/admin/settings-store";
import { resetStaff, useStaff } from "@/components/admin/staff-store";
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

function SaveRow({ saved, dirty }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t pt-4">
      {saved && !dirty && (
        <p role="status" className="text-sm text-status-good">
          Saved
        </p>
      )}
      <Button type="submit" disabled={!dirty}>
        Save changes
      </Button>
    </div>
  );
}

// Drafts sit on top of what's stored, so stored values show once the browser has loaded them.
function useDraft(stored) {
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);
  const values = { ...stored, ...draft };
  const dirty = Object.entries(draft).some(([key, value]) => stored[key] !== value);

  return {
    values,
    dirty,
    saved,
    change(key, value) {
      setDraft((current) => ({ ...current, [key]: value }));
      setSaved(false);
    },
    done() {
      setDraft({});
      setSaved(true);
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
    saveSettings({ business: values });
    form.done();
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
        <SaveRow saved={form.saved} dirty={form.dirty} />
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
    saveSettings({
      pickupReminderDays: days,
      requirePaymentBeforeDelivery: form.values.requirePaymentBeforeDelivery,
    });
    form.done();
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

        <SaveRow saved={form.saved} dirty={form.dirty} />
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

function ResetButton({ label, onReset }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span role="status" className="text-sm text-status-good">
        {done && !confirming ? "Done" : ""}
      </span>
      <Button
      variant="outline"
      size="sm"
      className={confirming ? "border-status-bad text-status-bad hover:text-status-bad" : undefined}
      aria-label={confirming ? `Confirm reset ${label}` : `Reset ${label}`}
      onBlur={() => setConfirming(false)}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          setDone(false);
          return;
        }
        onReset();
        setConfirming(false);
        setDone(true);
      }}
    >
      <RotateCcw aria-hidden="true" />
      {confirming ? "Click again to reset" : "Reset"}
    </Button>
    </div>
  );
}

function SavedData() {
  const routes = useRoutes();
  const rates = useShippingRates();
  const staff = useStaff();
  const settings = useSettings();
  const added = routes.filter((route) => !route.builtIn).length;
  const priced = Object.keys(rates).length;
  const customised = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);
  const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;

  const rows = [
    {
      label: "routes",
      title: "Routes",
      detail: `${plural(added, "added route")}. Removes added routes and branch changes.`,
      onReset: resetRoutes,
    },
    {
      label: "shipping rates",
      title: "Shipping rates",
      detail: `Set for ${plural(priced, "route")}. Clears every price per kg.`,
      onReset: resetShippingRates,
    },
    {
      label: "staff",
      title: "Staff",
      detail: `${staff.length === 1 ? "1 person" : `${staff.length} people`}. Goes back to the sample team.`,
      onReset: resetStaff,
    },
    {
      label: "settings",
      title: "Settings",
      detail: customised ? "Changed from the defaults." : "Using the defaults.",
      onReset: resetSettings,
    },
  ];

  return (
    <SettingsCard
      title="Data saved in this browser"
      description="Until the portal has a server, changes are kept only on this computer. Resetting can't be undone."
    >
      <ul className="divide-y">
        {rows.map(({ label, title, detail, onReset }) => (
          <li key={label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
            <ResetButton label={label} onReset={onReset} />
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

export function SettingsView() {
  return (
    <div className="grid gap-5">
      <BusinessProfile />
      <PackageRules />
      <Appearance />
      <SavedData />
    </div>
  );
}
