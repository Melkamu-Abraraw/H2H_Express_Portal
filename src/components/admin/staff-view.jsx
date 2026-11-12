"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useToday } from "@/components/admin/date-range-picker";
import { useRoutes } from "@/components/admin/routes-store";
import {
  ROLES,
  removeStaffMember,
  saveStaffMember,
  useStaff,
} from "@/components/admin/staff-store";
import { ALL, Filter, relativeDay } from "@/components/admin/table-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ALL_BRANCHES = "ALL";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_ID = "staff-form";

const STATUS_TABS = [
  { value: ALL, label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

const roleOptions = [
  { value: ALL, label: "All roles" },
  ...ROLES.map(({ value }) => ({ value, label: value })),
];

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

// Branches across every route; shared branches (e.g. Toronto) appear once.
function useBranches() {
  const routes = useRoutes();
  const branches = new Map();
  for (const route of routes) {
    for (const [key, branch] of Object.entries(route.branches)) {
      if (!branches.has(key)) branches.set(key, { key, ...branch, country: route.from.name });
    }
  }
  return [...branches.values()];
}

function branchLabel(branches, key) {
  if (key === ALL_BRANCHES) return "All branches";
  return branches.find((branch) => branch.key === key)?.name ?? "Branch removed";
}

// The portal must always keep one active owner who can manage staff.
function isLastOwner(member, staff) {
  return (
    member?.role === "Owner" &&
    member.active &&
    staff.filter((other) => other.role === "Owner" && other.active).length === 1
  );
}

function TextField({ id, label, error, className = "", ...props }) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-status-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function StaffForm({ member, staff, branches, onDone }) {
  const [form, setForm] = useState(() => ({
    name: member?.name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: member?.role ?? "Front desk",
    branch: member?.branch ?? branches[0]?.key ?? ALL_BRANCHES,
    active: member?.active ?? true,
  }));
  const [errors, setErrors] = useState({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const lastOwner = isLastOwner(member, staff);

  function set(changes) {
    setForm((current) => ({ ...current, ...changes }));
  }

  function submit(event) {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    const found = {};
    if (!form.name.trim()) found.name = "Enter their full name.";
    if (!EMAIL.test(email)) found.email = "Enter a valid email address.";
    else if (staff.some((other) => other.email.toLowerCase() === email && other.id !== member?.id)) {
      found.email = "Someone on the team already uses this email.";
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    saveStaffMember({
      ...(member && { id: member.id, active: form.active }),
      name: form.name.trim(),
      email,
      phone: form.phone.trim(),
      role: form.role,
      branch: form.branch,
    });
    onDone();
  }

  function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    removeStaffMember(member.id);
    onDone();
  }

  return (
    <>
      <form
        id={FORM_ID}
        onSubmit={submit}
        noValidate
        className="grid flex-1 content-start gap-5 overflow-y-auto border-y p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="staff-name"
            label="Full name"
            autoComplete="off"
            value={form.name}
            error={errors.name}
            onChange={(event) => set({ name: event.target.value })}
          />
          <TextField
            id="staff-email"
            label="Email"
            type="email"
            autoComplete="off"
            value={form.email}
            error={errors.email}
            onChange={(event) => set({ email: event.target.value })}
          />
          <TextField
            id="staff-phone"
            className="sm:col-span-2"
            label="Phone (optional)"
            type="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(event) => set({ phone: event.target.value })}
          />
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">Role</legend>
          <RadioGroup
            value={form.role}
            onValueChange={(role) => set({ role })}
            className="grid gap-2 sm:grid-cols-2"
          >
            {ROLES.map(({ value, description }) => {
              const disabled = lastOwner && value !== "Owner";
              return (
                <label
                  key={value}
                  className={`flex gap-3 rounded-md border p-3 text-sm has-data-[state=checked]:border-ring has-data-[state=checked]:bg-accent/40 ${disabled ? "opacity-50" : "cursor-pointer"}`}
                >
                  <RadioGroupItem value={value} disabled={disabled} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{value}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
          {lastOwner && (
            <p className="text-xs text-muted-foreground">
              This is the only active owner, so their role can&apos;t change. Make someone else an
              owner first.
            </p>
          )}
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="staff-branch">Branch</Label>
          <Select value={form.branch} onValueChange={(branch) => set({ branch })}>
            <SelectTrigger id="staff-branch" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.key} value={branch.key}>
                  {branch.name}
                  <span className="text-muted-foreground"> · {branch.country}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {member && (
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={form.active}
              disabled={lastOwner}
              onCheckedChange={(checked) => set({ active: checked === true })}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Deactivated staff can&apos;t use the portal, but the payments and updates they
                recorded keep their name.
              </span>
            </span>
          </label>
        )}
      </form>

      <DialogFooter className="flex-row flex-wrap items-center">
        {member && !lastOwner && (
          <Button
            type="button"
            variant="ghost"
            className="text-status-bad hover:text-status-bad"
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />
            {confirmRemove ? "Click again to remove" : "Remove"}
          </Button>
        )}
        <Button type="submit" form={FORM_ID} className="ml-auto">
          {member ? "Save changes" : "Add staff member"}
        </Button>
      </DialogFooter>
    </>
  );
}

function StatusCell({ member, today }) {
  if (!member.active) return <span className="text-muted-foreground">Deactivated</span>;

  let detail = "Hasn't signed in yet";
  if (member.lastActive) {
    const lastActive = new Date(member.lastActive);
    detail = `Last seen ${today ? relativeDay(lastActive, today).toLowerCase() : format(lastActive, "MMM d")}`;
  }
  return (
    <div className="flex flex-col leading-tight">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-status-good" aria-hidden="true" />
        Active
      </span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

export function StaffView() {
  const staff = useStaff();
  const branches = useBranches();
  const today = useToday();
  const [status, setStatus] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const [search, setSearch] = useState("");
  // undefined = closed, null = adding, otherwise the member being edited.
  const [editing, setEditing] = useState(undefined);

  const term = search.trim().toLowerCase();
  const byStatus = (member, value) =>
    value === ALL || (value === "active" ? member.active : !member.active);
  const visible = staff
    .filter(
      (member) =>
        byStatus(member, status) &&
        (role === ALL || member.role === role) &&
        (!term ||
          [member.name, member.email, member.phone].some((text) =>
            text.toLowerCase().includes(term),
          )),
    )
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(
    STATUS_TABS.map(({ value }) => [value, staff.filter((member) => byStatus(member, value)).length]),
  );
  const filtered = term || status !== ALL || role !== ALL;

  return (
    <>
      <div
        role="group"
        aria-label="Filter by role"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {ROLES.map(({ value, description }) => {
          const active = role === value;
          return (
            <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setRole(active ? ALL : value)}
                className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-left text-sm text-card-foreground shadow-xs transition-colors outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-ring aria-pressed:ring-1 aria-pressed:ring-ring"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{value}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">
                      {staff.filter((member) => member.active && member.role === value).length}
                    </span>{" "}
                    active
                  </span>
                </span>
                <span className="text-muted-foreground">{description}</span>
            </button>
          );
        })}
      </div>

      <Card className="min-w-0 pb-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <ToggleGroup
            type="single"
            value={status}
            onValueChange={(value) => value && setStatus(value)}
            aria-label="Staff status"
            className="rounded-lg bg-muted p-1"
          >
            {STATUS_TABS.map(({ value, label }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-7 gap-1.5 rounded-md px-3 text-muted-foreground hover:bg-transparent data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
              >
                {label}
                <span className="font-mono text-xs text-muted-foreground">{counts[value]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative w-full sm:w-auto sm:min-w-48 sm:max-w-xs sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search by name, email or phone"
              placeholder="Search name, email or phone..."
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Filter label="Filter by role" value={role} onChange={setRole} options={roleOptions} />
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStatus(ALL);
                setRole(ALL);
              }}
            >
              Clear
            </Button>
          )}
          <p role="status" className="text-sm text-muted-foreground sm:ml-auto">
            <span className="font-mono">{visible.length}</span> of{" "}
            <span className="font-mono">{staff.length}</span>
          </p>
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden="true" />
            Add staff member
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Role</TableHead>
                <TableHead className="text-muted-foreground">Branch</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((member) => (
                <TableRow
                  key={member.id}
                  className={`h-14 ${member.active ? "" : "text-muted-foreground"}`}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium"
                        aria-hidden="true"
                      >
                        {initials(member.name)}
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium">{member.name}</span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {member.role}
                      {member.role === "Owner" && (
                        <ShieldCheck className="size-3.5 text-brand-dark" aria-label="Full access" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{branchLabel(branches, member.branch)}</TableCell>
                  <TableCell className="font-mono text-[13px]">
                    {member.phone || <span className="font-sans text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <StatusCell member={member} today={today} />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Edit ${member.name}`}
                      onClick={() => setEditing(member)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No staff match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit staff member" : "Add staff member"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.name} · ${editing.id}`
                : "Give someone on your team access to the portal."}
            </DialogDescription>
          </DialogHeader>
          {editing !== undefined && (
            <StaffForm
              key={editing?.id ?? "new"}
              member={editing}
              staff={staff}
              branches={branches}
              onDone={() => setEditing(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
