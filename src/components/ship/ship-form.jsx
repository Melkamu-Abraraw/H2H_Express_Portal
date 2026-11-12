"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Script from "next/script";
import { ArrowRight, Check, ImagePlus, MapPin, Plus, X } from "lucide-react";
import { DIRECTIONS, RouteLabel } from "@/components/admin/shipping-routes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

const RECAPTCHA_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

const SHIPPING = [
  { value: "normal", label: "Normal — about 8 days" },
  { value: "express", label: "🚨 Express — about 4 days" },
];


const CONSENT =
  "I confirm that the information provided is accurate. I understand that prohibited, illegal, dangerous, or restricted items are not accepted. I agree that Hand to Hand Express may contact me by email, phone, SMS, or WhatsApp regarding this shipment. I understand that delivery time may vary due to customs, airline, courier, or operational delays.";

// 16px text stops phones zooming into fields; 44px rows are easy to tap.
const FIELD = "h-11 rounded-md text-base md:text-sm";
const DARK_BUTTON =
  "group gap-1 rounded-md bg-[#2c3654] font-semibold text-white hover:bg-[#3a4566] dark:bg-white dark:text-[#141a2e] dark:hover:bg-white/90";

// Same limits as the current site: keeps uploads small enough for the proxy and Apps Script.
function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function submitOrder(data) {
  const response = await fetch("/api/submit-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Server returned HTTP ${response.status} (not JSON)`);
  }
  if (!result.success) throw new Error(result.error || "Submission failed");
  return result;
}

function Section({ number, title, children }) {
  return (
    // min-w-0: fieldsets otherwise refuse to shrink below their content and overflow on phones.
    <fieldset className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 shadow-xs sm:p-6">
      <legend className="float-left mb-1 flex w-full items-baseline gap-3">
        <span className="font-mono text-sm font-semibold text-brand-dark dark:text-brand">
          {number}
        </span>
        <span className="text-base font-semibold">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, className = "", children }) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ChoiceCards({ name, value, onChange, options, columns = "sm:grid-cols-2" }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} name={name} className={`grid gap-2 ${columns}`}>
      {options.map(({ value: option, label, icon: Icon }) => (
        <label
          key={option}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors has-data-[state=checked]:border-brand-dark has-data-[state=checked]:bg-brand/10 dark:has-data-[state=checked]:border-brand"
        >
          <RadioGroupItem value={option} />
          {Icon && <Icon className="size-4 text-brand-dark dark:text-brand" aria-hidden="true" />}
          <span className="min-w-0">{label}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

function ContactFields({ prefix, emailOptional }) {
  const fields = [
    { key: "Name", label: "Full Name", autoComplete: "name" },
    {
      key: "Email",
      label: emailOptional ? "Email (optional)" : "Email",
      type: "email",
      autoComplete: "email",
      required: !emailOptional,
    },
    { key: "Phone", label: "Phone Number", type: "tel", autoComplete: "tel" },
    { key: "Address", label: "Address", autoComplete: "street-address" },
  ];
  // The current site lists the receiver's phone before their email.
  const ordered = emailOptional ? [fields[0], fields[2], fields[1], fields[3]] : fields;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ordered.map(({ key, label, wide, required = true, ...props }) => (
        <Field key={key} id={`${prefix}${key}`} label={label} className={wide ? "sm:col-span-2" : ""}>
          <Input
            id={`${prefix}${key}`}
            name={`${prefix}${key}`}
            required={required}
            className={FIELD}
            {...props}
          />
        </Field>
      ))}
    </div>
  );
}

// The form stays hidden until the visitor ticks "I'm not a robot".
function CaptchaGate({ onPass, notice }) {
  const box = useRef(null);
  const widget = useRef(null);
  const [error, setError] = useState("");

  function mount() {
    if (!box.current || widget.current !== null) return;
    widget.current = window.grecaptcha.render(box.current, {
      sitekey: RECAPTCHA_KEY,
      callback: async (token) => {
        setError("");
        try {
          const response = await fetch("/api/captcha", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const result = await response.json();
          if (!result.success) throw new Error(result.error);
          onPass(result.pass);
        } catch (e) {
          setError(e.message || "The check failed. Please try again.");
          window.grecaptcha.reset(widget.current);
        }
      },
    });
  }

  return (
    <div className="grid gap-4 rounded-lg border-[0.5px] bg-card p-5 sm:p-6">
      <Script
        src="https://www.google.com/recaptcha/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => window.grecaptcha.ready(mount)}
      />
      <div>
        <p className="text-base font-semibold">Before you start</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Please confirm you&apos;re not a robot to open the request form.
        </p>
      </div>
      <div ref={box} />
      {(error || notice) && (
        <p className="text-sm text-status-bad" role="alert">
          {error || notice}
        </p>
      )}
    </div>
  );
}

// Until the box is ticked, the page shows only the check; the form appears after.
export function ShipExperience({ intro }) {
  const [pass, setPass] = useState(null);
  const [notice, setNotice] = useState("");

  if (RECAPTCHA_KEY && !pass) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md items-center sm:min-h-[calc(100dvh-5rem)]">
        <div className="w-full">
        <CaptchaGate onPass={setPass} notice={notice} />
        </div>
      </div>
    );
  }
  return (
    <>
      {intro}
      <ShipForm
        pass={pass}
        onExpire={(message) => {
          setNotice(message);
          setPass(null);
        }}
      />
    </>
  );
}

function ShipForm({ pass, onExpire }) {
  const [direction, setDirection] = useState("CAET");
  const [shipping, setShipping] = useState("normal");
  const [branchCode, setBranchCode] = useState(DIRECTIONS.CAET.defaultBranch);
  const [items, setItems] = useState([{ id: 1, desc: "", qty: "1", kg: "" }]);
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  const photoUrlRef = useRef(null);

  // Shows a preview of the chosen photo and frees its browser memory when it changes or is removed.
  function choosePhoto(file) {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = file ? URL.createObjectURL(file) : null;
    setPhoto(file);
    setPhotoUrl(photoUrlRef.current);
  }
  useEffect(() => () => photoUrlRef.current && URL.revokeObjectURL(photoUrlRef.current), []);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState({ state: "idle" });
  const nextItemId = useRef(2);
  // When the page opened: forms submitted within seconds are bots.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const route = DIRECTIONS[direction];
  const branches = Object.entries(route.branches);
  const branch = route.branches[branchCode] ?? route.branches[route.defaultBranch];
  const totalKg = items.reduce((sum, item) => sum + (Number.parseFloat(item.kg) || 0), 0);
  const busy = status.state === "processing" || status.state === "submitting";

  function changeDirection(next) {
    setDirection(next);
    setBranchCode(DIRECTIONS[next].defaultBranch);
  }

  function updateItem(id, field, value) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    const id = nextItemId.current;
    nextItemId.current += 1;
    setItems((current) => [...current, { id, desc: "", qty: "1", kg: "" }]);
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = (name) => form.elements[name].value;
    const data = {
      direction,
      branchCode: branches.length > 1 ? branchCode : branches[0][0],
      submissionMethod: "remote",
      shippingMethod: shipping,
      senderName: value("senderName"),
      senderEmail: value("senderEmail"),
      senderPhone: value("senderPhone"),
      senderAddress: value("senderAddress"),
      receiverName: value("receiverName"),
      receiverPhone: value("receiverPhone"),
      receiverAddress: value("receiverAddress"),
      receiverEmail: value("receiverEmail"),
      notes: value("notes"),
      items: items.map(({ desc, qty, kg }) => ({ desc, qty, kg })),
      photoBase64: null,
      photoMimeType: null,
      startedAt: openedAt.current,
      // Hidden from people; bots fill it in.
      website: value("website"),
      captchaToken: pass,
    };

    if (photo) {
      setStatus({ state: "processing" });
      try {
        data.photoBase64 = (await compressImage(photo, 1280, 0.7)).split(",")[1];
        data.photoMimeType = "image/jpeg";
      } catch {
        setStatus({
          state: "error",
          message: "Could not process the photo — try a different image or leave it blank.",
        });
        return;
      }
    }

    setStatus({ state: "submitting" });
    try {
      const result = await submitOrder(data);
      setStatus({ state: "done", result });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      // The pass lapsed: send them back to the checkbox.
      if (/security check/i.test(error.message)) return onExpire(error.message);
      setStatus({ state: "error", message: `Something went wrong: ${error.message || error}` });
    }
  }

  if (status.state === "done") {
    const { trackingId, office } = status.result;
    return (
      <div className="grid gap-4 rounded-lg border bg-card p-5 shadow-xs sm:p-6" role="status">
        <span className="grid size-10 place-items-center rounded-full bg-status-good/12 text-status-good">
          <Check className="size-5" strokeWidth={3} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Request received · Reference</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-brand-dark dark:text-brand">
            {trackingId}
          </p>
          <p className="mt-3 text-sm">
            Thanks! Our team will check your details when you bring the package in. The weight and
            price are confirmed at the office, and you&apos;ll get your tracking number by email once
            it&apos;s registered.
          </p>
          {office && (
            <p className="mt-2 text-sm">
              Drop off at {office.name} — {office.address}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid min-w-0 scroll-mt-20 gap-4 sm:gap-5" id="send">
      {/* Honeypot: invisible to people, tempting to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        defaultValue=""
      />
      <Section number="01" title="Shipment Details">
        <div className="grid gap-1.5">
          <p className="text-sm text-muted-foreground" id="direction-label">
            Direction
          </p>
          <RadioGroup
            value={direction}
            onValueChange={changeDirection}
            aria-labelledby="direction-label"
            className="grid gap-2 sm:grid-cols-3"
          >
            {Object.entries(DIRECTIONS).map(([code, { from, to }]) => (
              <label
                key={code}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors has-data-[state=checked]:border-brand-dark has-data-[state=checked]:bg-brand/10 dark:has-data-[state=checked]:border-brand"
              >
                <RadioGroupItem value={code} />
                <RouteLabel from={from} to={to} />
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="grid gap-1.5">
          <p className="text-sm text-muted-foreground">Shipping option</p>
          <ChoiceCards name="shippingMethod" value={shipping} onChange={setShipping} options={SHIPPING} />
        </div>

        {branches.length > 1 ? (
          <Field id="branchCode" label="Drop-off branch">
            <Select value={branchCode} onValueChange={setBranchCode}>
              <SelectTrigger
                id="branchCode"
                className="h-11! w-full min-w-0 rounded-md text-left *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map(([code, option]) => (
                  <SelectItem key={code} value={code}>
                    {option.name} — {option.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <div className="grid gap-1.5">
            <p className="text-sm text-muted-foreground">Office location</p>
            <p className="rounded-md border px-3 py-2.5 text-sm">
              <span className="block font-medium">{branch.name}</span>
              <span className="text-muted-foreground">{branch.address}</span>
            </p>
          </div>
        )}

        <div className="flex gap-3 rounded-md bg-brand/10 p-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-dark dark:text-brand" aria-hidden="true" />
          <p>
            <strong className="block font-semibold">
              Drop-off: {branch.name}
            </strong>
            <span className="text-muted-foreground">{branch.address}.</span>{" "}
            Bring your item to our branch. Our team will inspect and register it.
          </p>
        </div>
      </Section>

      <Section number="02" title="Sender">
        <ContactFields prefix="sender" />
      </Section>

      <Section number="03" title="Items to send">
        <ul className="grid gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_auto] items-end gap-2 max-sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-sm:rounded-md max-sm:border max-sm:p-3"
            >
              <Field id={`item-desc-${item.id}`} label="Description" className="max-sm:col-span-3">
                <Input
                  id={`item-desc-${item.id}`}
                  required
                  placeholder="e.g. Clothes"
                  className={FIELD}
                  value={item.desc}
                  onChange={(event) => updateItem(item.id, "desc", event.target.value)}
                />
              </Field>
              <Field id={`item-qty-${item.id}`} label="Qty" className="max-sm:col-start-1 max-sm:row-start-2">
                <Input
                  id={`item-qty-${item.id}`}
                  required
                  type="number"
                  inputMode="numeric"
                  min="1"
                  className={`${FIELD} font-mono`}
                  value={item.qty}
                  onChange={(event) => updateItem(item.id, "qty", event.target.value)}
                />
              </Field>
              <Field id={`item-kg-${item.id}`} label="KG" className="max-sm:col-start-2 max-sm:row-start-2">
                <Input
                  id={`item-kg-${item.id}`}
                  required
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  className={`${FIELD} font-mono`}
                  value={item.kg}
                  onChange={(event) => updateItem(item.id, "kg", event.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground max-sm:col-start-3 max-sm:row-start-2"
                title="Remove item"
                aria-label="Remove item"
                disabled={items.length === 1}
                onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" className="h-10 rounded-md" onClick={addItem}>
            <Plus className="text-brand-dark dark:text-brand" aria-hidden="true" />
            Add another item
          </Button>
          <p className="text-sm font-semibold" role="status">
            Total: <span className="font-mono">{totalKg.toFixed(1)}</span> kg
          </p>
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm text-muted-foreground">Photo of item (optional)</p>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-3 text-sm transition-colors hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/50">
            <ImagePlus className="size-5 shrink-0 text-brand-dark dark:text-brand" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {photo ? `Selected: ${photo.name}` : "Choose a photo"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => choosePhoto(event.target.files[0] ?? null)}
            />
          </label>
          {photoUrl && (
            <div className="relative mt-1 aspect-4/3 w-full max-w-xs overflow-hidden rounded-md border">
              <Image src={photoUrl} alt="Preview of the chosen photo" fill unoptimized className="object-cover" />
              <Button
                type="button"
                size="icon"
                aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 size-7 bg-black/70 text-white hover:bg-black"
                onClick={() => choosePhoto(null)}
              >
                <X />
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section number="04" title="Receiver">
        <ContactFields prefix="receiver" emailOptional />
      </Section>

      <Section number="05" title="Notes (optional)">
        <Textarea
          name="notes"
          rows={2}
          aria-label="Notes"
          placeholder="e.g. Urgent, Fragile item"
          className="min-h-20 rounded-md text-base md:text-sm"
        />
        <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
          <Checkbox
            required
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
            className="mt-1"
          />
          <span>{CONSENT}</span>
        </label>
        {status.state === "error" && (
          <p role="alert" className="rounded-md bg-status-bad/10 px-3 py-2.5 text-sm text-status-bad">
            {status.message}
          </p>
        )}
        <Button type="submit" disabled={busy || !agreed} className={`${DARK_BUTTON} h-12 w-full text-base sm:w-auto sm:justify-self-end sm:px-6`}>
          {status.state === "processing"
            ? "Processing photo..."
            : status.state === "submitting"
              ? "Submitting..."
              : "Submit delivery request"}
          {!busy && (
            <ArrowRight
              className="size-4 text-brand transition-transform group-hover:translate-x-0.5 dark:text-brand-dark"
              strokeWidth={2.5}
              aria-hidden="true"
            />
          )}
        </Button>
      </Section>
    </form>
  );
}
