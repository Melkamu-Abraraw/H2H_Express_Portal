"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Copy,
  EllipsisVertical,
  Hash,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  Pin,
  PinOff,
  Reply,
  RotateCcw,
  Search,
  SendHorizontal,
  Smile,
  SquarePen,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  deleteChatMessage,
  editChatMessage,
  loadChat,
  loadMessages,
  markConversationRead,
  openDirect,
  pinChatMessage,
  reactToMessage,
  sendChatMessage,
  setConversationMuted,
} from "@/components/admin/chat-store";
import { initialsOf, useProfile } from "@/components/admin/profile-store";
import { useInboxEvents, useOnline, useRealtimeStatus, useTyping } from "@/components/admin/realtime";
import { can } from "@/lib/permissions";
import { uploadPhotos } from "@/lib/upload-photos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MESSAGE_MAX = 4000;
const PHOTOS_MAX = 6;
// How often to check without real-time, and as a backup while it's connected.
const THREAD_POLL = { polling: 3000, live: 30000 };
const LIST_POLL = { polling: 10000, live: 60000 };
// A new header (avatar, name, time) starts when the sender changes or after this gap.
const GROUP_GAP = 5 * 60 * 1000;
const TRACKING = /\b(H2H-[A-Z0-9]+-\d+)\b/gi;
// Same list as the server's (src/lib/server/chat.js); it refuses anything else.
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "✅"];
const EMOJIS = ["👍", "🙏", "👋", "😊", "😂", "❤️", "🎉", "👏", "✅", "❌", "⚠️", "📦", "🚚", "✈️", "📍", "⏰", "💵", "📸", "🔥", "🤝", "😅", "🤔", "👀", "💯"];

function visible() {
  return document.visibilityState === "visible";
}

function clock(value) {
  return format(new Date(value), "h:mm a");
}

function shortTime(value) {
  const date = new Date(value);
  if (isToday(date)) return clock(date);
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

function dayLabel(date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

// Tracking numbers in a message open that package on the Packages page.
function MessageText({ text }) {
  return text.split(TRACKING).map((part, index) =>
    index % 2 ? (
      <Link
        key={index}
        href={`/admin/packages?q=${encodeURIComponent(part.toUpperCase())}`}
        className="font-mono font-medium underline underline-offset-2"
      >
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

function PersonAvatar({ person, name, online = false, className = "size-10" }) {
  return (
    <span className="relative shrink-0">
      <Avatar className={className}>
        {person?.photo && <AvatarImage src={person.photo} alt="" className="object-top" />}
        <AvatarFallback className="bg-neutral-900 text-sm font-semibold text-brand">
          {initialsOf(person?.name ?? name ?? "")}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-status-good">
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}

function ConversationIcon({ conversation, people, online }) {
  if (conversation.type === "direct") {
    return (
      <PersonAvatar
        person={people.find((person) => person.id === conversation.withId)}
        name={conversation.name}
        online={online?.has(conversation.withId)}
      />
    );
  }
  const Icon = conversation.all ? Users : Hash;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground" aria-hidden="true">
      <Icon className="size-[18px]" />
    </span>
  );
}

function ConversationItem({ conversation, people, online, active, onOpen }) {
  const last = conversation.lastMessage;
  const unread = conversation.unread;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        aria-current={active ? "true" : undefined}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring aria-[current]:bg-muted"
      >
        <ConversationIcon conversation={conversation} people={people} online={online} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`flex min-w-0 items-center gap-1.5 text-[15px] ${unread && !conversation.muted ? "font-semibold" : "font-medium"}`}>
              <span className="truncate">{conversation.name}</span>
              {conversation.muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
            </span>
            {last && <span className="shrink-0 text-xs text-muted-foreground">{shortTime(last.at)}</span>}
          </span>
          {last && (
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-muted-foreground">
                {conversation.type === "channel" ? `${last.senderName.split(" ")[0]}: ` : ""}
                {last.text}
              </span>
              {unread > 0 && (
                <span
                  className={`inline-flex size-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 font-mono text-[11px] font-bold ${
                    conversation.muted ? "bg-muted text-muted-foreground" : "bg-brand text-black"
                  }`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ConversationList({ list, online, activeId, onOpen, onNew }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const matches = list.conversations.filter((conversation) => !term || conversation.name.toLowerCase().includes(term));
  const channels = matches.filter((conversation) => conversation.type === "channel");
  const direct = matches.filter((conversation) => conversation.type === "direct");
  const item = (conversation) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      people={list.people}
      online={online}
      active={conversation.id === activeId}
      onOpen={onOpen}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Conversations</h2>
          <Button variant="outline" onClick={onNew}>
            <MessageSquarePlus aria-hidden="true" />
            New message
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search conversations"
            placeholder="Search conversations"
            className="h-10 rounded-lg border-0 bg-muted pl-9 shadow-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {channels.length > 0 && (
          <>
            <p className="px-3 pt-3 pb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">Channels</p>
            <ul className="grid gap-1">{channels.map(item)}</ul>
          </>
        )}
        <p className="px-3 pt-5 pb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">Direct messages</p>
        {direct.length ? (
          <ul className="grid gap-1">{direct.map(item)}</ul>
        ) : (
          <p className="px-3 text-sm text-muted-foreground">{term ? "No one matches." : "Start one with New message."}</p>
        )}
      </div>
    </div>
  );
}

function Key({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded border bg-card px-1.5 font-sans text-[11px] font-medium text-foreground shadow-xs">
      {children}
    </kbd>
  );
}

function NewMessageDialog({ open, onOpenChange, people, online, selfId, onPick }) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const term = search.trim().toLowerCase();
  const others = people
    .filter(
      (person) =>
        person.id !== selfId &&
        (!term || [person.name, person.title, person.branch].some((text) => text.toLowerCase().includes(term))),
    )
    // People who are online now come first.
    .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name));
  const current = Math.min(active, Math.max(others.length - 1, 0));

  async function pick(person) {
    if (!person || busy) return;
    setBusy(person.id);
    setError("");
    try {
      await onPick(person.id);
      setSearch("");
      setActive(0);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  function move(step) {
    if (!others.length) return;
    const next = (current + step + others.length) % others.length;
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(others[current]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <DialogHeader className="gap-1 p-0 text-left">
            <DialogTitle className="text-lg">New message</DialogTitle>
            <DialogDescription>Send a direct message to someone on the team.</DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="outline" size="icon-sm" aria-label="Close" className="bg-muted/60">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="new-message-people"
              aria-activedescendant={others[current] ? `new-message-${others[current].id}` : undefined}
              placeholder="Search name, role or branch"
              aria-label="Search the team"
              className="h-10 rounded-lg pl-9 focus-visible:border-brand focus-visible:ring-brand/30"
              value={search}
              onKeyDown={onKeyDown}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
            />
          </div>
        </div>

        <div className="flex items-baseline justify-between px-5 pt-4 pb-1.5 text-xs text-muted-foreground">
          <span className="font-medium tracking-wider uppercase">Team</span>
          <span>
            {others.length} {others.length === 1 ? "person" : "people"}
          </span>
        </div>

        <ul ref={listRef} id="new-message-people" role="listbox" aria-label="Team" className="grid max-h-80 gap-0.5 overflow-y-auto px-2 pb-2">
          {others.map((person, index) => {
            const selected = index === current;
            return (
              <li
                key={person.id}
                id={`new-message-${person.id}`}
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseMove={() => index !== current && setActive(index)}
                onClick={() => pick(person)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${selected ? "bg-muted" : ""} ${busy && busy !== person.id ? "opacity-60" : ""}`}
              >
                <span className="relative shrink-0">
                  <Avatar className="size-9">
                    {person.photo && <AvatarImage src={person.photo} alt="" className="object-top" />}
                    <AvatarFallback
                      className={`text-xs font-semibold ${selected ? "bg-neutral-900 text-brand" : "bg-muted-foreground/15 text-foreground/70"}`}
                    >
                      {initialsOf(person.name)}
                    </AvatarFallback>
                  </Avatar>
                  {online.has(person.id) && (
                    <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-popover bg-status-good">
                      <span className="sr-only">Online</span>
                    </span>
                  )}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-semibold">{person.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {person.title} · {person.branch}
                  </span>
                </span>
                {busy === person.id ? (
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : (
                  selected && (
                    <span className="hidden sm:inline-flex" aria-hidden="true">
                      <Key>Enter ↵</Key>
                    </span>
                  )
                )}
              </li>
            );
          })}
          {others.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              {people.length > 1 ? "No one matches your search." : "No one else has activated their account yet."}
            </li>
          )}
        </ul>

        {error && (
          <p role="alert" className="px-5 pb-3 text-sm text-status-bad">
            {error}
          </p>
        )}

        <div className="hidden items-center gap-4 border-t bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground sm:flex" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <Key>↑↓</Key> Navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Key>↵</Key> Open chat
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Key>Esc</Key> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeaderButton({ label, pressed, ...props }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} aria-pressed={pressed} className="text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground" {...props} />
  );
}

function MembersButton({ members, online }) {
  const sorted = [...members].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <HeaderButton label="Members">
          <UserRound aria-hidden="true" />
        </HeaderButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <p className="border-b px-4 py-2.5 text-sm font-semibold">
          {members.length} {members.length === 1 ? "member" : "members"}
        </p>
        <ul className="grid max-h-80 gap-0.5 overflow-y-auto p-2">
          {sorted.map((person) => (
            <li key={person.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <PersonAvatar person={person} online={online.has(person.id)} className="size-8" />
              <span className="grid min-w-0 leading-tight">
                <span className="truncate text-sm font-medium">{person.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {person.title} · {person.branch}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Photos({ photos }) {
  return (
    <div className={`grid gap-1 ${photos.length > 1 ? "grid-cols-2" : ""}`}>
      {photos.map((photo) => (
        <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
          {/* Cloudinary already serves these sized; next/image would need the host configured. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt="Photo in chat"
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            className="max-h-64 w-full object-cover"
          />
        </a>
      ))}
    </div>
  );
}

function EmptyState({ conversation, onSuggest }) {
  const direct = conversation.type === "direct";
  const suggestions = direct
    ? [
        ["Say hello", "Hi! 👋"],
        ["Ask about a package", "Quick question about package H2H-"],
        ["Share an update", "Update: "],
      ]
    : [
        ["Say hello to the team", "Hello team! 👋"],
        ["Share today's update", "Today's update: "],
        ["Ask a question", "Quick question: "],
      ];
  const detail = direct
    ? `Send ${conversation.name.split(" ")[0]} a message.`
    : conversation.all
      ? "Start the conversation with everyone on the team."
      : `Start the conversation with everyone at ${conversation.name}.`;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-chat px-4 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-brand/15 text-brand-dark dark:text-brand" aria-hidden="true">
        <MessageSquare className="size-7" />
      </span>
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold">No messages yet</p>
        <p className="text-muted-foreground">{detail}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        {suggestions.map(([label, text]) => (
          <button
            key={label}
            type="button"
            onClick={() => onSuggest(text)}
            className="rounded-full border bg-card px-4 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Hover controls stay visible on touch screens, and while their menu is open.
const HOVER_CONTROL =
  "opacity-100 transition-opacity md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100 has-[[data-state=open]]:opacity-100";

function ReactionButton({ onReact }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="React"
          title="React"
          className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground shadow-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Smile className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto rounded-full p-1">
        <div className="flex gap-0.5">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React with ${emoji}`}
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
              className="grid size-9 place-items-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MessageMenu({ message, mine, canDeleteAny, onAction }) {
  const hasText = Boolean(message.text);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message options"
          className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
        <DropdownMenuItem className="gap-3 px-2.5 py-2" onSelect={() => onAction("reply", message)}>
          <Reply aria-hidden="true" />
          Reply
        </DropdownMenuItem>
        {hasText && (
          <DropdownMenuItem className="gap-3 px-2.5 py-2" onSelect={() => onAction("copy", message)}>
            <Copy aria-hidden="true" />
            Copy
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="gap-3 px-2.5 py-2" onSelect={() => onAction(message.pinned ? "unpin" : "pin", message)}>
          {message.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
          {message.pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        {mine && (
          <DropdownMenuItem className="gap-3 px-2.5 py-2" onSelect={() => onAction("edit", message)}>
            <SquarePen aria-hidden="true" />
            Edit
          </DropdownMenuItem>
        )}
        {(mine || canDeleteAny) && (
          <>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem variant="destructive" className="gap-3 px-2.5 py-2" onSelect={() => onAction("delete", message)}>
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Reactions({ message, people, selfId, onReact }) {
  if (!message.reactions?.length) return null;
  const nameOf = (id) => (id === selfId ? "You" : (people.find((person) => person.id === id)?.name ?? "Someone"));
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {message.reactions.map(({ emoji, userIds }) => {
        const mine = userIds.includes(selfId);
        return (
          <button
            key={emoji}
            type="button"
            title={userIds.map(nameOf).join(", ")}
            aria-label={`${emoji} ${userIds.length}${mine ? ", including you. Tap to remove yours" : ". Tap to add yours"}`}
            aria-pressed={mine}
            onClick={() => onReact(emoji)}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              mine ? "border-brand bg-brand/20 font-semibold" : "bg-card hover:bg-muted"
            }`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {userIds.length}
          </button>
        );
      })}
    </div>
  );
}

function ReplyQuote({ replyTo, onJump }) {
  return (
    <button
      type="button"
      onClick={() => onJump?.(replyTo.id)}
      className="mb-1.5 block w-full rounded-md border-l-2 border-orange-500 bg-black/[0.04] px-2.5 py-1.5 text-left text-xs outline-none hover:bg-black/[0.07] focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/5"
    >
      <span className="block font-semibold text-orange-600 dark:text-orange-400">{replyTo.senderName}</span>
      <span className="line-clamp-2 text-muted-foreground">{replyTo.text || "Message"}</span>
    </button>
  );
}

// One message as a card: others' are white with their name in orange, yours are tinted.
// Hovering shows a reaction button beside the card and an options menu inside it.
function Bubble({ message, mine, person, online, startsGroup, people, selfId, canDeleteAny, onRetry, onAction, onReact, onJump, highlighted }) {
  const date = new Date(message.createdAt);
  const pending = Boolean(message.status);
  const interactive = !pending && !message.deleted && onAction;
  return (
    <div data-message-id={message.id} className={`group/message flex items-start gap-2.5 ${mine ? "flex-row-reverse" : ""} ${startsGroup ? "mt-4" : "mt-1"}`}>
      {!mine && (
        <div className="w-9 shrink-0">
          {startsGroup && (
            <span className="relative block">
              <Avatar className="size-9 ring-2 ring-orange-300 ring-offset-1 ring-offset-chat dark:ring-orange-500/60">
                {person?.photo && <AvatarImage src={person.photo} alt="" className="object-top" />}
                <AvatarFallback className="bg-neutral-900 text-xs font-semibold text-brand">{initialsOf(person?.name ?? message.senderName)}</AvatarFallback>
              </Avatar>
              {online && (
                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-chat bg-status-good">
                  <span className="sr-only">Online</span>
                </span>
              )}
            </span>
          )}
        </div>
      )}
      <div className={`flex max-w-[min(40rem,82%)] min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-2 ${mine ? "flex-row-reverse" : ""}`}>
          <div
            className={`relative min-w-0 rounded-xl px-3.5 pt-2.5 pb-1.5 text-sm ${
              mine ? "rounded-tr-sm bg-chat-mine" : "rounded-tl-sm border bg-card shadow-sm"
            } ${pending && message.status === "sending" ? "opacity-60" : ""} ${highlighted ? "ring-2 ring-brand" : ""}`}
          >
            {interactive && (
              <span className={`absolute top-1 right-1 ${HOVER_CONTROL}`}>
                <MessageMenu message={message} mine={mine} canDeleteAny={canDeleteAny} onAction={onAction} />
              </span>
            )}
            {!mine && startsGroup && <p className="mb-1 pr-7 text-[13px] font-semibold text-orange-600 dark:text-orange-400">{message.senderName}</p>}
            {message.replyTo && !message.deleted && <ReplyQuote replyTo={message.replyTo} onJump={onJump} />}
            {message.deleted ? (
              <p className="pr-2 text-muted-foreground italic">This message was deleted</p>
            ) : (
              <div className={`grid gap-1.5 ${interactive ? "pr-6" : ""}`}>
                {message.photos?.length > 0 && <Photos photos={message.photos} />}
                {message.text && (
                  <p className="break-words whitespace-pre-wrap">
                    <MessageText text={message.text} />
                  </p>
                )}
              </div>
            )}
            <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
              {message.pinned && <Pin className="size-3" aria-label="Pinned" />}
              {message.edited && !message.deleted && <span>edited</span>}
              <time dateTime={date.toISOString()}>{format(date, "MMM d, yyyy, h:mm a")}</time>
            </p>
          </div>
          {interactive && (
            <span className={`shrink-0 ${HOVER_CONTROL}`}>
              <ReactionButton onReact={(emoji) => onReact(message, emoji)} />
            </span>
          )}
        </div>
        {!message.deleted && <Reactions message={message} people={people} selfId={selfId} onReact={(emoji) => onReact?.(message, emoji)} />}
        {message.status === "failed" && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mt-1 inline-flex items-center gap-1 px-1 text-xs text-status-bad hover:underline"
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            Not sent. Tap to retry.
          </button>
        )}
      </div>
    </div>
  );
}

function MessageList({ items, scrollRef, hasMore, loadingEarlier, onLoadEarlier, notice, ...bubble }) {
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto bg-chat px-4 py-5 sm:px-6">
        {hasMore && (
          <div className="mb-4 text-center">
            <Button variant="outline" size="sm" className="bg-card" disabled={loadingEarlier} onClick={onLoadEarlier}>
              {loadingEarlier ? "Loading…" : "Load earlier messages"}
            </Button>
          </div>
        )}
        <ol>
          {items.map((message, index) => {
            const previous = items[index - 1];
            const date = new Date(message.createdAt);
            const newDay = !previous || !isSameDay(new Date(previous.createdAt), date);
            const startsGroup =
              newDay || previous.senderId !== message.senderId || date - new Date(previous.createdAt) > GROUP_GAP;
            return (
              <li key={message.id}>
                {newDay && (
                  <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground" role="separator">
                    <span className="h-px flex-1 bg-border" />
                    {dayLabel(date)}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <Bubble
                  {...bubble}
                  message={message}
                  mine={message.senderId === bubble.selfId}
                  person={bubble.people.find((member) => member.id === message.senderId)}
                  online={bubble.onlineIds.has(message.senderId)}
                  startsGroup={startsGroup}
                  highlighted={bubble.highlightId === message.id}
                />
              </li>
            );
          })}
        </ol>
      </div>
      {notice && (
        <p role="status" className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-md">
          {notice}
        </p>
      )}
    </div>
  );
}

function SearchResults({ search, people, selfId }) {
  if (search.loading) {
    return (
      <p role="status" className="flex flex-1 items-center justify-center gap-2 bg-chat text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Searching…
      </p>
    );
  }
  if (!search.query) {
    return <p className="flex flex-1 items-center justify-center bg-chat text-sm text-muted-foreground">Type to search this conversation.</p>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-chat px-4 py-5 sm:px-6">
      <p role="status" className="mb-3 text-sm text-muted-foreground">
        {search.results.length
          ? `${search.results.length === 50 ? "Latest 50" : search.results.length} ${search.results.length === 1 ? "message" : "messages"} with "${search.query}"`
          : `No messages with "${search.query}".`}
      </p>
      <ol className="grid gap-1">
        {search.results.map((message) => (
          <li key={message.id}>
            <Bubble
              message={message}
              mine={message.senderId === selfId}
              person={people.find((member) => member.id === message.senderId)}
              startsGroup
              people={people}
              selfId={selfId}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Composer({ value, onChange, photos, onAddPhotos, onRemovePhoto, onSend, onTyping, label, disabled, mode, onCancelMode, textRef }) {
  const fileRef = useRef(null);
  const editing = mode?.type === "edit";
  const tooLong = value.length > MESSAGE_MAX;
  const canSend = (value.trim() || photos.length || (editing && mode.message.photos?.length)) && !tooLong && !disabled;

  function submit(event) {
    event?.preventDefault();
    if (canSend) onSend();
  }

  function insertEmoji(emoji) {
    const box = textRef.current;
    const start = box?.selectionStart ?? value.length;
    const end = box?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + emoji + value.slice(end));
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <form onSubmit={submit} className="px-4 pt-2 pb-3 sm:px-6">
      <div className="overflow-hidden rounded-xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        {mode && (
          <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
            {editing ? <SquarePen className="size-4 shrink-0 text-orange-600" aria-hidden="true" /> : <Reply className="size-4 shrink-0 text-orange-600" aria-hidden="true" />}
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                {editing ? "Editing message" : `Replying to ${mode.message.senderName}`}
              </span>
              <span className="truncate text-xs text-muted-foreground">{mode.message.text || "📷 Photo"}</span>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={editing ? "Cancel editing" : "Cancel reply"} onClick={onCancelMode}>
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
        {photos.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3">
            {photos.map((photo) => (
              <li key={photo.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt="Photo to send" className="size-16 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => onRemovePhoto(photo.id)}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1 p-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach photos"
            title="Attach photos"
            className="text-muted-foreground"
            disabled={disabled || editing || photos.length >= PHOTOS_MAX}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip aria-hidden="true" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              onAddPhotos([...event.target.files]);
              event.target.value = "";
            }}
          />
          <textarea
            ref={textRef}
            value={value}
            rows={1}
            aria-label={label}
            placeholder={label}
            aria-invalid={tooLong || undefined}
            className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            onChange={(event) => {
              onChange(event.target.value);
              if (event.target.value.trim() && !editing) onTyping?.();
            }}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter (or composing with an IME) adds a line; Esc cancels a reply or edit.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
              if (event.key === "Escape" && mode) onCancelMode();
            }}
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Add emoji" title="Add emoji" className="text-muted-foreground">
                <Smile aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-64 p-2">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`Add ${emoji}`}
                    onClick={() => insertEmoji(emoji)}
                    className="grid size-7 place-items-center rounded-md text-lg hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button type="submit" size="icon" aria-label={editing ? "Save edit" : "Send"} disabled={!canSend} className="size-10 rounded-lg bg-brand text-black hover:bg-brand/85">
            {editing ? <Check aria-hidden="true" /> : <SendHorizontal aria-hidden="true" />}
          </Button>
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {tooLong ? (
          <span className="text-status-bad">Keep messages under {MESSAGE_MAX} characters.</span>
        ) : (
          <>
            <kbd className="font-sans font-semibold">Enter</kbd> to {editing ? "save" : "send"} · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line
            {mode && (
              <>
                {" "}
                · <kbd className="font-sans font-semibold">Esc</kbd> to cancel
              </>
            )}
          </>
        )}
      </p>
    </form>
  );
}

function PinnedBar({ pinned, onJump }) {
  const [index, setIndex] = useState(0);
  if (!pinned.length) return null;
  const current = pinned[Math.min(index, pinned.length - 1)];
  return (
    <button
      type="button"
      onClick={() => {
        onJump(current.id);
        setIndex((value) => (value + 1) % pinned.length);
      }}
      className="flex w-full items-center gap-3 border-b bg-card px-4 py-2 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted sm:px-6"
    >
      <Pin className="size-4 shrink-0 text-orange-600" aria-hidden="true" />
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
          Pinned message{pinned.length > 1 ? ` ${Math.min(index, pinned.length - 1) + 1} of ${pinned.length}` : ""}
        </span>
        <span className="truncate text-sm">
          <span className="font-medium">{current.senderName}:</span> {current.text || "📷 Photo"}
        </span>
      </span>
    </button>
  );
}

const NO_THREAD = { id: null, messages: [], pending: [], pinned: [], hasMore: false, loadingEarlier: false, error: "", syncedAt: null };
const NO_SEARCH = { conversationId: null, query: "", results: [], loading: false };

// Puts updated copies of messages (edits, deletes, reactions, pins) in place, and keeps the
// pinned list in step with them.
function applyChanges(thread, changed) {
  if (!changed.length) return thread;
  const byId = new Map(changed.map((message) => [message.id, message]));
  let pinned = thread.pinned.filter((message) => !byId.has(message.id) || byId.get(message.id).pinned);
  for (const message of changed) {
    if (message.pinned) pinned = [message, ...pinned.filter((item) => item.id !== message.id)];
  }
  return {
    ...thread,
    messages: thread.messages.map((message) => byId.get(message.id) ?? message),
    pinned: pinned.map((message) => byId.get(message.id) ?? message),
  };
}

export function ChatView() {
  const profile = useProfile();
  const live = useRealtimeStatus() ? "live" : "polling";
  const online = useOnline();
  const [list, setList] = useState({ state: "loading", conversations: [], people: [] });
  // null on a phone shows the list; on wider screens the first conversation opens by default.
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(NO_THREAD);
  const [picking, setPicking] = useState(false);
  // Per conversation, so switching away keeps what was being written.
  const [drafts, setDrafts] = useState({});
  const [attachments, setAttachments] = useState({});
  const [search, setSearch] = useState(NO_SEARCH);
  // Replying to or editing a message: { conversationId, type: "reply" | "edit", message }.
  const [mode, setMode] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [notice, setNotice] = useState("");
  const [highlightId, setHighlightId] = useState(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const stickToBottom = useRef(true);
  const threadRef = useRef(thread);
  useEffect(() => {
    threadRef.current = thread;
  });

  const shownId = selectedId ?? list.conversations[0]?.id ?? null;
  const shown = list.conversations.find((conversation) => conversation.id === shownId) ?? null;
  const ready = thread.id === shownId;
  const searching = search.conversationId === shownId;
  const activeMode = mode?.conversationId === shownId ? mode : null;
  const draft = drafts[shownId] ?? "";
  const photos = attachments[shownId] ?? [];
  const canDeleteAny = can(profile, "staff.manage");
  const { typingNames, notifyTyping, stoppedTyping } = useTyping(shownId, profile.name, profile.id);
  // Set by the effects below, so real-time signals and timers can trigger the same loads.
  const reloadList = useRef(null);
  const pullNew = useRef(null);

  useInboxEvents((event) => {
    if (event?.conversationId === shownId && (event.type === "message" || event.type === "update")) pullNew.current?.();
    if (event?.type !== "update") reloadList.current?.();
  });

  // The conversation list: loaded once, then on every real-time signal.
  useEffect(() => {
    let cancelled = false;
    function load() {
      loadChat()
        .then((body) => !cancelled && setList({ state: "ready", conversations: body.conversations, people: body.people }))
        .catch((error) => !cancelled && setList((current) => ({ ...current, state: current.state === "ready" ? "ready" : "error", error: error.message })));
    }
    reloadList.current = load;
    load();
    return () => {
      cancelled = true;
      reloadList.current = null;
    };
  }, []);

  // The open conversation: first page and pins, then new and changed messages on each signal
  // or backup check.
  useEffect(() => {
    if (!shownId) return;
    let cancelled = false;

    function seen() {
      if (!visible()) return;
      markConversationRead(shownId);
      setList((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === shownId ? { ...conversation, unread: 0 } : conversation,
        ),
      }));
    }

    Promise.all([loadMessages(shownId), loadMessages(shownId, { pinned: true })])
      .then(([body, pins]) => {
        if (cancelled) return;
        stickToBottom.current = true;
        setThread({ ...NO_THREAD, id: shownId, messages: body.messages, pinned: pins.messages, hasMore: body.hasMore, syncedAt: body.now });
        seen();
      })
      .catch((error) => !cancelled && setThread({ ...NO_THREAD, id: shownId, error: error.message }));

    function pull() {
      const current = threadRef.current;
      if (current.id !== shownId) return;
      const after = current.messages.at(-1)?.id;
      loadMessages(shownId, { after, changedSince: current.syncedAt })
        .then((body) => {
          if (cancelled) return;
          if (body.messages.length) {
            const box = scrollRef.current;
            stickToBottom.current = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
          }
          setThread((latest) => {
            if (latest.id !== shownId) return latest;
            const known = new Set(latest.messages.map((message) => message.id));
            const added = body.messages.filter((message) => !known.has(message.id));
            const updated = applyChanges({ ...latest, syncedAt: body.now ?? latest.syncedAt }, body.changed ?? []);
            return added.length ? { ...updated, messages: [...updated.messages, ...added] } : updated;
          });
          if (body.messages.length) seen();
        })
        .catch(() => {});
    }
    pullNew.current = pull;

    return () => {
      cancelled = true;
      pullNew.current = null;
    };
  }, [shownId]);

  // Backup checks: frequent without real-time, rare while it's connected.
  useEffect(() => {
    const threadTimer = setInterval(() => visible() && pullNew.current?.(), THREAD_POLL[live]);
    const listTimer = setInterval(() => visible() && reloadList.current?.(), LIST_POLL[live]);
    return () => {
      clearInterval(threadTimer);
      clearInterval(listTimer);
    };
  }, [live]);

  // Follow new messages when the reader is already at the bottom.
  useEffect(() => {
    const box = scrollRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [thread.messages.length, thread.pending]);

  // Server search, a moment after typing stops.
  useEffect(() => {
    if (!searching || !search.query) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      loadMessages(search.conversationId, { q: search.query })
        .then((body) => !cancelled && setSearch((current) => ({ ...current, results: body.messages, loading: false })))
        .catch(() => !cancelled && setSearch((current) => ({ ...current, results: [], loading: false })));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searching, search.conversationId, search.query]);

  // Short-lived notes such as "Copied".
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(timer);
  }, [highlightId]);

  function setDraft(text) {
    setDrafts((current) => ({ ...current, [shownId]: text }));
  }

  function focusComposer() {
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function addPhotos(files) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    setAttachments((current) => {
      const existing = current[shownId] ?? [];
      const added = images
        .slice(0, PHOTOS_MAX - existing.length)
        .map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
      return { ...current, [shownId]: [...existing, ...added] };
    });
  }

  function removePhoto(id) {
    setAttachments((current) => {
      const existing = current[shownId] ?? [];
      existing.filter((photo) => photo.id === id).forEach((photo) => URL.revokeObjectURL(photo.preview));
      return { ...current, [shownId]: existing.filter((photo) => photo.id !== id) };
    });
  }

  function replaceMessage(saved) {
    setThread((latest) => applyChanges(latest, [saved]));
  }

  function jumpTo(messageId) {
    const element = scrollRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (!element) {
      setNotice("That message is further up. Load earlier messages to see it.");
      return;
    }
    stickToBottom.current = false;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(messageId);
  }

  async function deliver(conversationId, pending) {
    try {
      // Photos go to Cloudinary first (once, even if sending is retried).
      const uploaded = pending.uploaded ?? (pending.files?.length ? await uploadPhotos(pending.files, "chat") : []);
      pending.uploaded = uploaded;
      const saved = await sendChatMessage(conversationId, pending.text, uploaded, pending.replyTo?.id);
      pending.photos?.forEach((photo) => photo.url.startsWith("blob:") && URL.revokeObjectURL(photo.url));
      setThread((latest) =>
        latest.id !== conversationId
          ? latest
          : {
              ...latest,
              pending: latest.pending.filter((message) => message.id !== pending.id),
              messages: latest.messages.some((message) => message.id === saved.id) ? latest.messages : [...latest.messages, saved],
            },
      );
      reloadList.current?.();
    } catch {
      setThread((latest) => ({
        ...latest,
        pending: latest.pending.map((message) => (message.id === pending.id ? { ...message, status: "failed", uploaded: pending.uploaded } : message)),
      }));
    }
  }

  async function saveEdit() {
    const { message } = activeMode;
    const text = draft.trim();
    setMode(null);
    setDraft("");
    try {
      replaceMessage(await editChatMessage(shownId, message.id, text));
      reloadList.current?.();
    } catch (error) {
      setNotice(error.message);
    }
  }

  function send() {
    if (activeMode?.type === "edit") {
      saveEdit();
      return;
    }
    const text = draft.trim();
    const replyTo = activeMode?.type === "reply" ? activeMode.message : null;
    const pending = {
      id: `pending-${crypto.randomUUID()}`,
      senderId: profile.id,
      senderName: profile.name,
      text,
      photos: photos.map((photo) => ({ url: photo.preview })),
      files: photos.map((photo) => photo.file),
      replyTo: replyTo && { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text || "📷 Photo" },
      reactions: [],
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    stickToBottom.current = true;
    setThread((latest) => ({ ...latest, pending: [...latest.pending, pending] }));
    setDraft("");
    setMode(null);
    setAttachments((current) => ({ ...current, [shownId]: [] }));
    stoppedTyping();
    deliver(shownId, pending);
  }

  function retry(message) {
    const again = { ...message, status: "sending" };
    setThread((latest) => ({ ...latest, pending: latest.pending.map((item) => (item.id === message.id ? again : item)) }));
    deliver(shownId, again);
  }

  async function react(message, emoji) {
    try {
      replaceMessage(await reactToMessage(shownId, message.id, emoji));
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function act(action, message) {
    if (action === "reply" || action === "edit") {
      setMode({ conversationId: shownId, type: action, message });
      if (action === "edit") setDraft(message.text);
      focusComposer();
    } else if (action === "copy") {
      navigator.clipboard?.writeText(message.text).then(
        () => setNotice("Copied"),
        () => setNotice("Couldn't copy"),
      );
    } else if (action === "pin" || action === "unpin") {
      try {
        replaceMessage(await pinChatMessage(shownId, message.id, action === "pin"));
        setNotice(action === "pin" ? "Pinned for everyone here" : "Unpinned");
      } catch (error) {
        setNotice(error.message);
      }
    } else if (action === "delete") {
      setConfirmDelete(message);
    }
  }

  async function removeMessage() {
    const message = confirmDelete;
    setConfirmDelete(null);
    if (activeMode?.message.id === message.id) setMode(null);
    try {
      replaceMessage(await deleteChatMessage(shownId, message.id));
      reloadList.current?.();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function loadEarlier() {
    const first = thread.messages[0]?.id;
    if (!first) return;
    setThread((latest) => ({ ...latest, loadingEarlier: true }));
    const box = scrollRef.current;
    const fromBottom = box ? box.scrollHeight - box.scrollTop : 0;
    try {
      const body = await loadMessages(shownId, { before: first });
      stickToBottom.current = false;
      setThread((latest) => ({
        ...latest,
        messages: [...body.messages, ...latest.messages],
        hasMore: body.hasMore,
        loadingEarlier: false,
      }));
      // Keep the reader's place after older messages are added above.
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - fromBottom;
      });
    } catch {
      setThread((latest) => ({ ...latest, loadingEarlier: false }));
    }
  }

  async function startDirect(userId) {
    const id = await openDirect(userId);
    const body = await loadChat();
    setList({ state: "ready", conversations: body.conversations, people: body.people });
    setSelectedId(id);
    setPicking(false);
  }

  async function toggleMute() {
    const muted = !shown.muted;
    const flip = (value) =>
      setList((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === shown.id ? { ...conversation, muted: value } : conversation,
        ),
      }));
    flip(muted);
    try {
      await setConversationMuted(shown.id, muted);
    } catch {
      flip(!muted);
    }
  }

  const person = shown?.type === "direct" ? list.people.find((member) => member.id === shown.withId) : null;
  const members = shown ? list.people.filter((member) => shown.memberIds?.includes(member.id)) : [];
  const count = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  const subtitle = !shown
    ? ""
    : shown.type === "direct"
      ? person
        ? [online.has(person.id) && "Online", person.title, person.branch].filter(Boolean).join(" · ")
        : "No longer on the team"
      : shown.all
        ? `Everyone on the team · ${count}`
        : `Branch channel · ${count}`;
  const items = [...thread.messages, ...thread.pending];

  if (list.state === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Loading chat…
      </p>
    );
  }
  if (list.state === "error") {
    return <p role="alert" className="text-sm text-status-bad">Couldn&apos;t load chat: {list.error}</p>;
  }

  return (
    <div className="grid h-[calc(100dvh-8.5rem)] min-h-[28rem] overflow-hidden rounded-2xl border bg-card md:grid-cols-[19rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={`${selectedId ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r`}>
        <ConversationList list={list} online={online} activeId={shownId} onOpen={setSelectedId} onNew={() => setPicking(true)} />
      </aside>

      <section className={`${selectedId ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col`} aria-label={shown?.name ?? "Conversation"}>
        {shown ? (
          <>
            <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back to conversations" onClick={() => setSelectedId(null)}>
                <ArrowLeft aria-hidden="true" />
              </Button>
              {shown.type === "direct" ? (
                <ConversationIcon conversation={shown} people={list.people} online={online} />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
                  {shown.all ? <Users className="size-[18px]" /> : <Hash className="size-[18px]" />}
                </span>
              )}
              <div className="grid min-w-0 flex-1 leading-tight">
                <h2 className="truncate font-semibold">{shown.name}</h2>
                <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <HeaderButton
                  label="Search messages"
                  pressed={searching}
                  onClick={() => setSearch(searching ? NO_SEARCH : { ...NO_SEARCH, conversationId: shownId })}
                >
                  <Search aria-hidden="true" />
                </HeaderButton>
                <MembersButton members={members} online={online} />
                <HeaderButton label={shown.muted ? "Unmute notifications" : "Mute notifications"} pressed={shown.muted} onClick={toggleMute}>
                  {shown.muted ? <BellOff aria-hidden="true" /> : <Bell aria-hidden="true" />}
                </HeaderButton>
              </div>
            </header>

            {searching && (
              <div className="flex items-center gap-2 border-b px-4 py-2 sm:px-6">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  autoFocus
                  aria-label={`Search messages in ${shown.name}`}
                  placeholder={`Search messages in ${shown.name}`}
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  value={search.query}
                  onChange={(event) =>
                    setSearch((current) => ({ ...current, query: event.target.value, loading: Boolean(event.target.value.trim()) }))
                  }
                  onKeyDown={(event) => event.key === "Escape" && setSearch(NO_SEARCH)}
                />
                <Button variant="ghost" size="icon-sm" aria-label="Close search" onClick={() => setSearch(NO_SEARCH)}>
                  <X aria-hidden="true" />
                </Button>
              </div>
            )}

            {!searching && ready && <PinnedBar key={shownId} pinned={thread.pinned} onJump={jumpTo} />}

            {searching ? (
              <SearchResults search={{ ...search, query: search.query.trim() }} people={list.people} selfId={profile.id} />
            ) : !ready ? (
              <p role="status" className="flex flex-1 items-center justify-center gap-2 bg-chat text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Loading messages…
              </p>
            ) : thread.error ? (
              <p role="alert" className="flex flex-1 items-center justify-center bg-chat text-sm text-status-bad">
                {thread.error}
              </p>
            ) : items.length === 0 ? (
              <EmptyState conversation={shown} onSuggest={(text) => {
                setDraft(text);
                focusComposer();
              }} />
            ) : (
              <MessageList
                items={items}
                people={list.people}
                selfId={profile.id}
                onlineIds={online}
                canDeleteAny={canDeleteAny}
                highlightId={highlightId}
                hasMore={thread.hasMore}
                loadingEarlier={thread.loadingEarlier}
                notice={notice}
                onRetry={retry}
                onAction={act}
                onReact={react}
                onJump={jumpTo}
                onLoadEarlier={loadEarlier}
                scrollRef={scrollRef}
              />
            )}

            <div className="border-t">
              <p className="h-5 truncate px-6 pt-1.5 text-xs text-muted-foreground" aria-live="polite">
                {typingNames.length === 1
                  ? `${typingNames[0]} is typing…`
                  : typingNames.length > 1
                    ? `${typingNames.slice(0, 2).join(" and ")}${typingNames.length > 2 ? " and others" : ""} are typing…`
                    : ""}
              </p>
              <Composer
                value={draft}
                onChange={setDraft}
                photos={photos}
                onAddPhotos={addPhotos}
                onRemovePhoto={removePhoto}
                onSend={send}
                onTyping={notifyTyping}
                mode={activeMode}
                onCancelMode={() => {
                  if (activeMode?.type === "edit") setDraft("");
                  setMode(null);
                }}
                textRef={composerRef}
                disabled={!ready || Boolean(thread.error)}
                label={`Message ${shown.type === "direct" ? shown.name : `#${shown.name}`}`}
              />
            </div>
          </>
        ) : (
          <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Choose a conversation.</p>
        )}
      </section>

      <NewMessageDialog open={picking} onOpenChange={setPicking} people={list.people} online={online} selfId={profile.id} onPick={startDirect} />

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="gap-4 p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 p-0 text-left">
            <DialogTitle>Delete this message?</DialogTitle>
            <DialogDescription>
              Everyone in this conversation will see &ldquo;This message was deleted&rdquo; in its place. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeMessage}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
