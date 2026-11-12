"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ImagePlus, MapPin, Plus, Truck, UserCheck, X, Zap } from "lucide-react";
import { CURRENT_USER } from "@/components/admin/current-user";
import { PackageReceiptDialog } from "@/components/admin/package-receipt";
import { uploadPackagePhotos } from "@/lib/upload-photos";
import { formatMoney, getRate, useShippingRates } from "@/components/admin/pricing-store";
import { useRoutes } from "@/components/admin/routes-store";
import { DIRECTIONS, RouteLabel } from "@/components/admin/shipping-routes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const SHIPPING_OPTIONS = [
  { value: "normal", title: "Normal", detail: "About 8 days", icon: Truck },
  { value: "express", title: "Express", detail: "About 4 days", icon: Zap },
];

function isSectionValid(form, prefix) {
  return [...form.elements]
    .filter((element) => element.name?.startsWith(prefix))
    .every((element) => element.validity.valid);
}

function RegistrationSteps({ steps }) {
  const currentIndex = steps.findIndex((step) => !step.done);
  const shownIndex = currentIndex === -1 ? steps.length - 1 : currentIndex;

  return (
    <div className="grid gap-3">
      <p className="-mt-4 text-sm text-muted-foreground sm:hidden">
        Step {shownIndex + 1} of {steps.length} ·{" "}
        <span className="font-medium text-foreground">{steps[shownIndex].title}</span>
      </p>
      <ol className="grid grid-cols-5 gap-2" aria-label="Registration status">
        {steps.map((step, index) => {
          const current = index === currentIndex;
          const status = step.done ? "complete" : current ? "in progress" : "not started";
          return (
            <li key={step.id}>
              <a
                href={`#${step.id}`}
                aria-current={current ? "step" : undefined}
                aria-label={`${step.title}: ${status}`}
                className="grid gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span
                  className={`h-1 rounded-full ${
                    step.done ? "bg-green-700" : current ? "bg-brand" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`hidden items-center gap-1 text-sm sm:flex ${
                    current
                      ? "font-semibold"
                      : step.done
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.done && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{step.title}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FormSection({ id, step, title, description, children }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader className="flex flex-row items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand font-mono text-xs font-bold text-black">
          {step}
        </span>
        <div className="grid gap-0.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function TextField({ name, label, className, ...props }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} autoComplete="off" {...props} />
    </div>
  );
}

function OptionCards({ name, legend, options, value, onChange }) {
  return (
    <div className="grid gap-1.5">
      <Label id={`${name}-label`}>{legend}</Label>
      <RadioGroup
        name={name}
        value={value}
        onValueChange={onChange}
        aria-labelledby={`${name}-label`}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map(({ value: optionValue, title, detail, icon: Icon }) => (
          <Label
            key={optionValue}
            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-sidebar-accent has-data-[state=checked]:border-brand has-data-[state=checked]:bg-sidebar-accent"
          >
            <RadioGroupItem value={optionValue} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-xs font-normal text-muted-foreground">{detail}</span>
            </span>
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

const NEW_RECEIVER = "new";

function ExistingCustomerNote({ customerId, name }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <input type="hidden" name="customerId" value={customerId} />
      <UserCheck className="size-4 shrink-0 text-status-good" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Existing customer: <span className="font-medium">{name}</span>{" "}
        <span className="font-mono text-xs text-muted-foreground">{customerId}</span>
      </p>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/admin/packages/new">Different sender</Link>
      </Button>
    </div>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function NewPackageForm({ prefill = null }) {
  const initialDirection = prefill?.direction ?? "CAET";
  const [direction, setDirection] = useState(initialDirection);
  const [shipping, setShipping] = useState(prefill?.shipping ?? "normal");
  // Routes added later aren't in DIRECTIONS; the active-branch fallback below picks one.
  const [branchCode, setBranchCode] = useState(
    prefill?.branchCode ?? DIRECTIONS[initialDirection]?.defaultBranch ?? "",
  );
  const savedReceivers = prefill?.savedReceivers ?? [];
  const [receiverChoice, setReceiverChoice] = useState(prefill?.receiverName ?? NEW_RECEIVER);
  const receiver = savedReceivers.find((saved) => saved.name === receiverChoice) ?? null;
  // A request from the public page arrives with its items; staff correct the weights here.
  const [items, setItems] = useState(
    prefill?.items?.length
      ? prefill.items.map((item, index) => ({
          id: index + 1,
          description: item.description,
          qty: String(item.qty),
          kg: String(item.kg),
        }))
      : [{ id: 1, description: "", qty: "1", kg: "" }],
  );
  // Photos the customer already uploaded with their request.
  const [customerPhotos, setCustomerPhotos] = useState(prefill?.photos ?? []);
  const [photos, setPhotos] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [saving, setSaving] = useState({ state: "idle" });
  const formRef = useRef(null);
  const [contactsValid, setContactsValid] = useState({
    sender: Boolean(prefill),
    receiver: Boolean(receiver),
  });
  const photoUrls = useRef(new Set());

  // Free the browser memory used by the previews when leaving the page.
  useEffect(() => {
    const urls = photoUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const routes = useRoutes();
  const routeOf = (code) => routes.find((route) => route.code === code) ?? routes[0];
  const directionConfig = routeOf(direction);
  const branches = Object.entries(directionConfig.branches);
  // Branches can be edited on the Routes page, so fall back if the chosen one was removed.
  const activeBranchCode = directionConfig.branches[branchCode]
    ? branchCode
    : directionConfig.defaultBranch in directionConfig.branches
      ? directionConfig.defaultBranch
      : branches[0][0];
  const branch = directionConfig.branches[activeBranchCode];
  const totalKg = items.reduce((sum, item) => sum + (Number.parseFloat(item.kg) || 0), 0);
  const shippingOption = SHIPPING_OPTIONS.find((option) => option.value === shipping);
  const rates = useShippingRates();
  const rate = getRate(rates, directionConfig.code, shipping);
  const { currency } = directionConfig;
  const fee = rate === null ? null : Math.round(rate * totalKg * 100) / 100;
  const payAtPickup = paymentMethod === "pickup";
  const paidNow = payAtPickup ? 0 : Number.parseFloat(amountPaid) || 0;
  const outstanding = fee === null ? null : Math.max(0, fee - paidNow);

  const itemsDone = items.every(
    (item) =>
      item.description.trim() &&
      Number.parseInt(item.qty, 10) >= 1 &&
      Number.parseFloat(item.kg) > 0,
  );
  const steps = [
    { id: "step-package", title: "Package", done: true },
    { id: "step-sender", title: "Sender", done: contactsValid.sender },
    { id: "step-items", title: "Items", done: Boolean(itemsDone) },
    { id: "step-receiver", title: "Receiver", done: contactsValid.receiver },
    { id: "step-submitted", title: "Submitted", done: submitted },
  ];

  function handleFormChange(event) {
    setSubmitted(false);
    setContactsValid({
      sender: isSectionValid(event.currentTarget, "sender"),
      receiver: isSectionValid(event.currentTarget, "receiver"),
    });
  }

  function changeDirection(next) {
    setDirection(next);
    setBranchCode(routeOf(next).defaultBranch);
    setSubmitted(false);
  }

  function chooseReceiver(name) {
    const saved = savedReceivers.find((option) => option.name === name);
    setReceiverChoice(name);
    if (saved) changeDirection(saved.route);
    setContactsValid((current) => ({ ...current, receiver: Boolean(saved) }));
    setSubmitted(false);
  }

  function updateItem(id, field, value) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        id: Math.max(...current.map((item) => item.id)) + 1,
        description: "",
        qty: "1",
        kg: "",
      },
    ]);
  }

  function removeItem(id) {
    setItems((current) =>
      current.length > 1 ? current.filter((item) => item.id !== id) : current,
    );
  }

  function addPhotos(event) {
    const added = [...event.target.files]
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    added.forEach(({ url }) => photoUrls.current.add(url));
    setPhotos((current) => [...current, ...added]);
    // Lets the same file be chosen again after it is removed.
    event.target.value = "";
  }

  function removePhoto(url) {
    URL.revokeObjectURL(url);
    photoUrls.current.delete(url);
    setPhotos((current) => current.filter((photo) => photo.url !== url));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving.state === "uploading" || saving.state === "saving") return;
    const cashier = CURRENT_USER.name;
    const elements = event.currentTarget.elements;
    const value = (name) => elements[name]?.value.trim() ?? "";
    const charge = fee ?? 0;
    const paid = Math.min(charge, paidNow);
    const sender = {
      name: value("senderName"),
      email: value("senderEmail"),
      phone: value("senderPhone"),
      address: value("senderAddress"),
    };
    const receiverDetails = {
      name: value("receiverName"),
      email: value("receiverEmail"),
      phone: value("receiverPhone"),
      address: value("receiverAddress"),
    };
    const packageItems = items.map(({ description, qty, kg }) => ({
      description,
      qty,
      kg,
    }));

    try {
      setSaving({ state: "uploading" });
      const uploaded = await uploadPackagePhotos(photos.map(({ file }) => file));

      setSaving({ state: "saving" });
      const response = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route: directionConfig.code,
          from: directionConfig.from.name,
          to: directionConfig.to.name,
          shipping,
          branch: {
            code: activeBranchCode,
            name: branch.name,
            address: branch.address,
          },
          sender,
          receiver: receiverDetails,
          items: packageItems,
          notes: value("notes"),
          photos: [...customerPhotos, ...uploaded],
          ...(prefill?.requestCode && { requestCode: prefill.requestCode }),
          currency,
          payment: { charge, paid, method: paymentMethod, cashier },
        }),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      if (!result.success) throw new Error(result.error || "Couldn't save the package");

      setSaving({ state: "idle" });
      setSubmitted(true);
      setReceipt({
        tracking: result.tracking,
        receiptNo: result.receiptNo,
        date: new Date(result.date),
        from: directionConfig.from.name,
        to: directionConfig.to.name,
        shipping: shippingOption.title,
        branch,
        sender,
        receiver: receiverDetails,
        items: packageItems,
        totalKg,
        currency,
        fee: charge,
        paid,
        balance: Math.max(0, charge - paid),
        method: { cash: "Cash", transfer: "Transfer", pickup: "Pay at pickup" }[paymentMethod],
        cashier,
        trackUrl: result.trackUrl,
        email: result.email,
      });
    } catch (error) {
      setSaving({ state: "error", message: error.message || String(error) });
    }
  }

  function registerAnother() {
    formRef.current?.reset();
    photos.forEach(({ url }) => {
      URL.revokeObjectURL(url);
      photoUrls.current.delete(url);
    });
    setPhotos([]);
    setItems([{ id: 1, description: "", qty: "1", kg: "" }]);
    setAmountPaid("");
    setContactsValid({ sender: Boolean(prefill), receiver: Boolean(receiver) });
    setSubmitted(false);
    setReceipt(null);
    setSaving({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-4">
      {prefill?.requestCode && (
        <Alert>
          <AlertTitle>Reviewing request {prefill.requestCode}</AlertTitle>
          <AlertDescription>
            Weigh and inspect the package, then correct the items and weights below before
            registering. The customer gets their tracking number only after you register it.
          </AlertDescription>
        </Alert>
      )}
      <RegistrationSteps steps={steps} />
      <PackageReceiptDialog
        receipt={receipt}
        onOpenChange={(open) => !open && setReceipt(null)}
        onRegisterAnother={registerAnother}
      />
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onChange={handleFormChange}
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="grid min-w-0 gap-4">
          <FormSection
            id="step-package"
            step="01"
            title="Package details"
            description="Choose the route, speed and drop-off point."
          >
            <div className="grid gap-1.5">
              <Label htmlFor="direction">Direction</Label>
              <Select name="direction" value={directionConfig.code} onValueChange={changeDirection}>
                <SelectTrigger id="direction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {routes.map(({ code, from, to }) => (
                    <SelectItem key={code} value={code}>
                      <RouteLabel from={from} to={to} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <OptionCards
              name="shippingMethod"
              legend="Shipping option"
              options={SHIPPING_OPTIONS}
              value={shipping}
              onChange={setShipping}
            />

            {branches.length > 1 && (
              <div className="grid gap-1.5">
                <Label htmlFor="branchCode">Drop-off branch</Label>
                <Select name="branchCode" value={activeBranchCode} onValueChange={setBranchCode}>
                  <SelectTrigger id="branchCode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(([code, option]) => (
                      <SelectItem key={code} value={code}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Alert className="border-brand/60 bg-sidebar-accent">
              <MapPin aria-hidden="true" />
              <AlertTitle>Filling out at: {branch.name}</AlertTitle>
              <AlertDescription className="[&_p:not(:last-child)]:mb-0">
                <p>{branch.address}</p>
                <p>The item will be marked as dropped off as soon as you submit.</p>
              </AlertDescription>
            </Alert>
          </FormSection>

          <FormSection
            id="step-sender"
            step="02"
            title="Sender"
            description={
              prefill?.requestCode
                ? "Filled in by the customer. Check it against their ID."
                : prefill
                  ? "Filled in from the customer record."
                  : "Who is sending this package?"
            }
          >
            {prefill?.customerId && (
              <ExistingCustomerNote customerId={prefill.customerId} name={prefill.sender.name} />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="senderName"
                label="Full name"
                defaultValue={prefill?.sender.name}
                required
              />
              <TextField
                name="senderEmail"
                label="Email (optional)"
                type="email"
                defaultValue={prefill?.sender.email}
              />
              <TextField
                name="senderPhone"
                label="Phone number"
                type="tel"
                defaultValue={prefill?.sender.phone}
                required
              />
              <TextField
                name="senderAddress"
                label="Address"
                defaultValue={prefill?.sender.address}
                required
              />
            </div>
          </FormSection>

          <FormSection
            id="step-items"
            step="03"
            title="Items to send"
            description="List everything in this package."
          >
            <div className="grid gap-2">
              <div className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem_2.25rem] gap-2 text-sm font-medium">
                <span>Description</span>
                <span>Qty</span>
                <span>KG</span>
              </div>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_4rem_4.5rem_2.25rem] items-center gap-2"
                >
                  <Input
                    name={`item-desc-${item.id}`}
                    aria-label={`Item ${index + 1} description`}
                    placeholder="e.g. Clothes"
                    autoComplete="off"
                    required
                    value={item.description}
                    onChange={(event) => updateItem(item.id, "description", event.target.value)}
                  />
                  <Input
                    name={`item-qty-${item.id}`}
                    aria-label={`Item ${index + 1} quantity`}
                    type="number"
                    min="1"
                    required
                    className="font-mono"
                    value={item.qty}
                    onChange={(event) => updateItem(item.id, "qty", event.target.value)}
                  />
                  <Input
                    name={`item-kg-${item.id}`}
                    aria-label={`Item ${index + 1} weight in kilograms`}
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    className="font-mono"
                    value={item.kg}
                    onChange={(event) => updateItem(item.id, "kg", event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() => removeItem(item.id)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" className="border-dashed" onClick={addItem}>
              <Plus /> Add another item
            </Button>

            <p className="text-right text-sm text-muted-foreground">
              Total:{" "}
              <span className="font-mono font-semibold text-foreground">{totalKg.toFixed(1)}</span>{" "}
              kg
            </p>

            <Separator />

            {customerPhotos.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Photos from the customer</Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {customerPhotos.map((photo, index) => (
                    <div key={photo.url} className="relative aspect-square overflow-hidden rounded-lg border">
                      <Image src={photo.url} alt={`Customer photo ${index + 1}`} fill unoptimized className="object-cover" />
                      <Button
                        type="button"
                        size="icon"
                        aria-label={`Remove customer photo ${index + 1}`}
                        className="absolute top-1 right-1 size-6 bg-black/70 text-white hover:bg-black"
                        onClick={() => setCustomerPhotos((current) => current.filter((item) => item.url !== photo.url))}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="photo">Photos of items (optional)</Label>
              {photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {photos.map(({ file, url }, index) => (
                    <div
                      key={url}
                      className="relative aspect-square overflow-hidden rounded-lg border"
                    >
                      <Image
                        src={url}
                        alt={`Preview of ${file.name}`}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      <Button
                        type="button"
                        size="icon"
                        aria-label={`Remove photo ${index + 1}`}
                        className="absolute top-1 right-1 size-6 bg-black/70 text-white hover:bg-black"
                        onClick={() => removePhoto(url)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <label
                    htmlFor="photo"
                    className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
                  >
                    <ImagePlus className="size-5" aria-hidden="true" />
                    Add more
                  </label>
                </div>
              ) : (
                <label
                  htmlFor="photo"
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent"
                >
                  <ImagePlus className="size-5" aria-hidden="true" />
                  Click to choose photos
                </label>
              )}
              <input
                id="photo"
                name="photo"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={addPhotos}
              />
            </div>
          </FormSection>

          <FormSection
            id="step-receiver"
            step="04"
            title="Receiver"
            description="Who will collect this package?"
          >
            {savedReceivers.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="savedReceiver">Saved receivers</Label>
                <Select value={receiverChoice} onValueChange={chooseReceiver}>
                  <SelectTrigger id="savedReceiver" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {savedReceivers.map((saved) => (
                      <SelectItem key={saved.name} value={saved.name}>
                        {saved.name} · {saved.address}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_RECEIVER}>New receiver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Remounts on a new choice so the fields start from that receiver's details. */}
            <div key={receiverChoice} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name="receiverName"
                  label="Full name"
                  defaultValue={receiver?.name}
                  required
                />
                <TextField
                  name="receiverPhone"
                  label="Phone number"
                  type="tel"
                  defaultValue={receiver?.phone}
                  required
                />
                <TextField
                  name="receiverEmail"
                  label="Email (optional)"
                  type="email"
                  defaultValue={receiver?.email}
                />
                <TextField
                  name="receiverAddress"
                  label="Address"
                  defaultValue={receiver?.address}
                  required
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            id="step-notes"
            step="05"
            title="Notes"
            description="Optional details for the team."
          >
            <Textarea
              name="notes"
              defaultValue={prefill?.notes}
              aria-label="Notes"
              placeholder="e.g. Urgent, Fragile item"
              rows={3}
            />
          </FormSection>
        </div>

        <Card id="step-submitted" className="scroll-mt-20 lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Review before submitting.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-2.5">
              <SummaryRow label="Route">
                <RouteLabel from={directionConfig.from} to={directionConfig.to} />
              </SummaryRow>
              <SummaryRow label="Shipping">
                {shippingOption.title} · {shippingOption.detail.toLowerCase()}
              </SummaryRow>
              <SummaryRow label="Branch">
                {branch.name.replace("Hand to Hand Express", "H2H")}
              </SummaryRow>
              <SummaryRow label="Items">
                <span className="font-mono">{items.length}</span>
              </SummaryRow>
              <SummaryRow label="Total weight">
                <span className="font-mono">{totalKg.toFixed(1)}</span> kg
              </SummaryRow>
            </dl>

            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-brand/60 bg-sidebar-accent p-3">
              <span className="text-sm font-medium">Amount to pay</span>
              <span className="font-mono text-lg font-bold">
                {fee !== null ? formatMoney(fee, currency) : "—"}
              </span>
            </div>

            <div className="grid gap-1.5">
              <Label id="paymentMethod-label">Payment method</Label>
              <input type="hidden" name="paymentMethod" value={paymentMethod} />
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby="paymentMethod-label"
                className="w-full"
                value={paymentMethod}
                onValueChange={(value) => value && setPaymentMethod(value)}
              >
                <ToggleGroupItem
                  value="cash"
                  className="flex-1 data-[state=on]:border-brand data-[state=on]:bg-sidebar-accent"
                >
                  Cash
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="transfer"
                  className="flex-1 data-[state=on]:border-brand data-[state=on]:bg-sidebar-accent"
                >
                  Transfer
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="pickup"
                  className="flex-1 data-[state=on]:border-brand data-[state=on]:bg-sidebar-accent"
                >
                  At pickup
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {payAtPickup ? (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                Nothing is taken now. The receiver pays the full amount when they collect the
                package.
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="amountPaid">Amount paid</Label>
                <div className="relative">
                  <Input
                    id="amountPaid"
                    name="amountPaid"
                    type="number"
                    min="0"
                    max={fee === null ? undefined : fee.toFixed(2)}
                    step="0.01"
                    placeholder="0.00"
                    autoComplete="off"
                    disabled={fee === null}
                    className="pr-12 font-mono"
                    value={amountPaid}
                    onChange={(event) => setAmountPaid(event.target.value)}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-muted-foreground">
                    {currency}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">Due at pickup</span>
              <span
                className={`font-mono font-bold ${
                  outstanding === null
                    ? "text-muted-foreground"
                    : outstanding > 0
                      ? "text-status-bad"
                      : "text-status-good"
                }`}
              >
                {outstanding === null ? "—" : formatMoney(outstanding, currency)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Cashier</span>
              <span className="font-medium">{CURRENT_USER.name}</span>
            </div>

            <div className="grid gap-2">
              {saving.state === "error" && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Not saved</AlertTitle>
                  <AlertDescription>{saving.message}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                disabled={saving.state === "uploading" || saving.state === "saving"}
              >
                {saving.state === "uploading" || saving.state === "saving"
                  ? "Registering package…"
                  : "Submit delivery request"}
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/admin">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
