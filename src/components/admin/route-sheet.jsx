"use client";

import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { COUNTRIES, COUNTRY_LIST, CURRENCIES } from "@/components/admin/countries";
import { saveRouteRates, useShippingRates } from "@/components/admin/pricing-store";
import { stepsBetween } from "@/components/admin/package-tracking";
import {
  deleteRoute,
  routeCode,
  saveRoute,
  useRoutes,
} from "@/components/admin/routes-store";
import { Country, RouteLabel } from "@/components/admin/shipping-routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const SPEEDS = [
  { value: "normal", label: "Normal" },
  { value: "express", label: "Express" },
];
const AIRPORT = /^[A-Z]{3}$/;
const FORM_ID = "route-form";

const newKey = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function initialForm(route, rates) {
  if (!route) {
    const key = "branch-1";
    return {
      from: "CA",
      to: "",
      currency: COUNTRIES.CA.currency,
      depart: "",
      arrive: "",
      normal: "",
      express: "",
      hub: "",
      city: "",
      branches: [{ key, name: "", address: "" }],
      defaultBranch: key,
    };
  }
  return {
    from: route.from.code,
    to: route.to.code,
    currency: route.currency,
    depart: route.depart ?? "",
    arrive: route.arrive ?? "",
    normal: rates[route.code]?.normal ?? "",
    express: rates[route.code]?.express ?? "",
    hub: route.hub ?? "",
    city: route.city ?? "",
    branches: Object.entries(route.branches).map(([key, branch]) => ({ key, ...branch })),
    defaultBranch: route.defaultBranch,
  };
}

function validate(form, route, routes) {
  const errors = {};
  if (!route?.builtIn) {
    if (!form.to) errors.to = "Choose where packages go.";
    else if (form.from === form.to) errors.to = "Choose a different country from the origin.";
    else {
      const code = routeCode(form.from, form.to);
      if (routes.some((other) => other.code === code && other.code !== route?.code)) {
        errors.to = "This route already exists.";
      }
    }
    for (const field of ["depart", "arrive"]) {
      if (form[field] && !AIRPORT.test(form[field])) errors[field] = "Use a 3-letter code, e.g. NBO.";
    }
    if (!form.hub.trim()) errors.hub = "Enter the city where we receive packages.";
    if (!form.city.trim()) errors.city = "Enter the city packages arrive in.";
  }
  for (const { value } of SPEEDS) {
    if (form[value] !== "" && !(Number.parseFloat(form[value]) > 0)) {
      errors[value] = "Enter a price above 0, or leave it empty.";
    }
  }
  form.branches.forEach((branch, index) => {
    if (!branch.name.trim()) errors[`branch-${index}-name`] = "Enter the branch name.";
    if (!branch.address.trim()) errors[`branch-${index}-address`] = "Enter the address.";
  });
  return errors;
}

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-status-bad">
      {message}
    </p>
  );
}

function Section({ title, description, children }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3">
        <span className="block text-sm font-semibold">{title}</span>
        {description && (
          <span className="block text-xs text-muted-foreground">{description}</span>
        )}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, error, children }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

const errorProps = (id, error) =>
  error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};

function CountrySelect({ id, value, onChange, error, placeholder }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" {...errorProps(id, error)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {COUNTRY_LIST.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            <Country country={country} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RouteForm({ route, onDone }) {
  const routes = useRoutes();
  const rates = useShippingRates();
  const [form, setForm] = useState(() => initialForm(route, rates));
  const [errors, setErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locked = Boolean(route?.builtIn);

  function set(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function setBranch(index, field, value) {
    set({
      branches: form.branches.map((branch, position) =>
        position === index ? { ...branch, [field]: value } : branch,
      ),
    });
  }

  function removeBranch(index) {
    const branches = form.branches.filter((_, position) => position !== index);
    const kept = branches.some((branch) => branch.key === form.defaultBranch);
    set({ branches, defaultBranch: kept ? form.defaultBranch : branches[0].key });
  }

  function submit(event) {
    event.preventDefault();
    const found = validate(form, route, routes);
    setErrors(found);
    if (Object.keys(found).length) return;

    const code = locked ? route.code : routeCode(form.from, form.to);
    const previousCode = route && !locked && route.code !== code ? route.code : undefined;
    saveRoute(
      {
        code,
        from: form.from,
        to: form.to,
        currency: form.currency,
        depart: form.depart,
        arrive: form.arrive,
        hub: form.hub.trim(),
        city: form.city.trim(),
        branches: Object.fromEntries(
          form.branches.map(({ key, name, address }) => [
            key,
            { name: name.trim(), address: address.trim() },
          ]),
        ),
        defaultBranch: form.defaultBranch,
      },
      previousCode,
    );
    const hasRates = form.normal !== "" || form.express !== "";
    saveRouteRates(code, hasRates ? { normal: form.normal, express: form.express } : null, previousCode);
    onDone();
  }

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteRoute(route.code);
    saveRouteRates(route.code, null);
    onDone();
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <form
        id={FORM_ID}
        onSubmit={submit}
        noValidate
        className="grid flex-1 content-start gap-7 overflow-y-auto px-4 pb-6"
      >
        <Section title="Route" description="The currency follows the country packages are sent from.">
          {locked ? (
            <div className="grid gap-2 rounded-md bg-muted/60 p-3 text-sm">
              <RouteLabel from={route.from} to={route.to} />
              <p className="text-muted-foreground">
                {route.depart} → {route.arrive} · Charged in {route.currency}
              </p>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Packages are already shipped on this route, so its countries, cities, currency and
                airports can&apos;t change.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="route-from" label="From">
                  <CountrySelect
                    id="route-from"
                    value={form.from}
                    onChange={(from) => set({ from, currency: COUNTRIES[from].currency })}
                  />
                </Field>
                <Field id="route-to" label="To" error={errors.to}>
                  <CountrySelect
                    id="route-to"
                    value={form.to}
                    placeholder="Choose a country"
                    error={errors.to}
                    onChange={(to) => set({ to })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="route-currency" label="Currency">
                  <Select value={form.currency} onValueChange={(currency) => set({ currency })}>
                    <SelectTrigger id="route-currency" className="w-full font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency} className="font-mono">
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {[
                  ["depart", "Departs from", "YYZ"],
                  ["arrive", "Arrives at", "NBO"],
                ].map(([field, label, example]) => (
                  <Field key={field} id={`route-${field}`} label={label} error={errors[field]}>
                    <Input
                      id={`route-${field}`}
                      value={form[field]}
                      maxLength={3}
                      placeholder={example}
                      className="font-mono uppercase"
                      onChange={(event) => set({ [field]: event.target.value.toUpperCase() })}
                      {...errorProps(`route-${field}`, errors[field])}
                    />
                  </Field>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["hub", "Receiving office city", "e.g. Toronto"],
                  ["city", "Arrival city", "e.g. Nairobi"],
                ].map(([field, label, example]) => (
                  <Field key={field} id={`route-${field}`} label={label} error={errors[field]}>
                    <Input
                      id={`route-${field}`}
                      value={form[field]}
                      placeholder={example}
                      onChange={(event) => set({ [field]: event.target.value })}
                      {...errorProps(`route-${field}`, errors[field])}
                    />
                  </Field>
                ))}
              </div>
            </>
          )}
        </Section>

        <Section title="Price per kg" description="Leave empty until you're ready to take packages.">
          <div className="grid gap-3 sm:grid-cols-2">
            {SPEEDS.map(({ value, label }) => (
              <Field key={value} id={`route-${value}`} label={label} error={errors[value]}>
                <div className="relative">
                  <Input
                    id={`route-${value}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="pr-12 font-mono"
                    value={form[value]}
                    onChange={(event) => set({ [value]: event.target.value })}
                    {...errorProps(`route-${value}`, errors[value])}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                    {form.currency}
                  </span>
                </div>
              </Field>
            ))}
          </div>
        </Section>

        <Section
          title="Tracking steps"
          description="The same six steps on every route. Only the two cities above change."
        >
          <ol className="grid gap-1.5">
            {stepsBetween(form.hub.trim(), form.city.trim()).map((step, index) => (
              <li key={step.key} className="flex items-center gap-2.5 text-sm">
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px] text-muted-foreground"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
        </Section>

        <Section
          title="Drop-off branches"
          description="Where customers bring packages. The default is preselected when registering."
        >
          <RadioGroup
            value={form.defaultBranch}
            onValueChange={(defaultBranch) => set({ defaultBranch })}
            aria-label="Default branch"
            className="grid gap-3"
          >
            {form.branches.map((branch, index) => {
              const nameId = `branch-${branch.key}-name`;
              const addressId = `branch-${branch.key}-address`;
              const nameError = errors[`branch-${index}-name`];
              const addressError = errors[`branch-${index}-address`];
              return (
                <div key={branch.key} className="grid gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <RadioGroupItem value={branch.key} />
                      Default branch
                    </label>
                    {form.branches.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${branch.name || `branch ${index + 1}`}`}
                        onClick={() => removeBranch(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  <Field id={nameId} label="Name" error={nameError}>
                    <Input
                      id={nameId}
                      value={branch.name}
                      placeholder="e.g. Nairobi Westlands Branch"
                      onChange={(event) => setBranch(index, "name", event.target.value)}
                      {...errorProps(nameId, nameError)}
                    />
                  </Field>
                  <Field id={addressId} label="Address" error={addressError}>
                    <Input
                      id={addressId}
                      value={branch.address}
                      placeholder="Street, city"
                      onChange={(event) => setBranch(index, "address", event.target.value)}
                      {...errorProps(addressId, addressError)}
                    />
                  </Field>
                </div>
              );
            })}
          </RadioGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              set({ branches: [...form.branches, { key: newKey("branch"), name: "", address: "" }] })
            }
          >
            <Plus aria-hidden="true" />
            Add branch
          </Button>
        </Section>
      </form>

      <SheetFooter className="flex-row flex-wrap items-center border-t">
        {route && !locked && (
          <Button
            type="button"
            variant="ghost"
            className="text-status-bad hover:text-status-bad"
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />
            {confirmDelete ? "Click again to delete" : "Delete route"}
          </Button>
        )}
        {hasErrors && (
          <p role="alert" className="text-sm text-status-bad">
            Fix the highlighted fields.
          </p>
        )}
        <Button type="submit" form={FORM_ID} className="ml-auto">
          {route ? "Save changes" : "Add route"}
        </Button>
      </SheetFooter>
    </>
  );
}

function RouteSheet({ route, trigger }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full gap-4 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{route ? "Edit route" : "Add route"}</SheetTitle>
          <SheetDescription>
            {route ? (
              <RouteLabel from={route.from} to={route.to} />
            ) : (
              "Set where packages go, what they cost, and where customers drop them off."
            )}
          </SheetDescription>
        </SheetHeader>
        {/* Mounted only while open, so the form starts fresh each time. */}
        <RouteForm route={route} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function AddRouteButton(props) {
  return (
    <RouteSheet
      trigger={
        <Button {...props}>
          <Plus aria-hidden="true" />
          Add route
        </Button>
      }
    />
  );
}

export function EditRouteButton({ route }) {
  return (
    <RouteSheet
      route={route}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      }
    />
  );
}
