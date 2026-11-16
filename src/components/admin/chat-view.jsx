"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Hash,
  LoaderCircle,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  Search,
  SendHorizontal,
  Smile,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  loadChat,
  loadMessages,
  markConversationRead,
  openDirect,
  sendChatMessage,
  setConversationMuted,
} from "@/components/admin/chat-store";
import { initialsOf, useProfile } from "@/components/admin/profile-store";
import { useInboxEvents, useOnline, useRealtimeStatus, useTyping } from "@/components/admin/realtime";
import { uploadPhotos } from "@/lib/upload-photos";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function NewMessageDialog({ open, onOpenChange, people, online, selfId, onPick }) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const term = search.trim().toLowerCase();
  const others = people.filter(
    (person) =>
      person.id !== selfId &&
      (!term || [person.name, person.title, person.branch].some((text) => text.toLowerCase().includes(term))),
  );

  async function pick(person) {
    setBusy(person.id);
    setError("");
    try {
      await onPick(person.id);
      setSearch("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Send a direct message to someone on the team.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            autoFocus
            placeholder="Search name, role or branch"
            aria-label="Search the team"
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ul className="-mx-2 grid max-h-80 gap-0.5 overflow-y-auto">
          {others.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => pick(person)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <PersonAvatar person={person} online={online.has(person.id)} className="size-9" />
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{person.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {person.title} · {person.branch}
                  </span>
                </span>
                {busy === person.id && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              </button>
            </li>
          ))}
          {others.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
              {people.length > 1 ? "No one matches your search." : "No one else has activated their account yet."}
            </li>
          )}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-status-bad">
            {error}
          </p>
        )}
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
        <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
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

function Bubble({ message, mine, person, startsGroup, onRetry }) {
  const date = new Date(message.createdAt);
  return (
    <div className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""} ${startsGroup ? "mt-3" : ""}`}>
      <div className="w-9 shrink-0">{startsGroup && !mine && <PersonAvatar person={person} name={message.senderName} className="size-9" />}</div>
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {startsGroup && (
          <p className="mb-1 flex items-baseline gap-2 px-1 text-xs text-muted-foreground">
            {!mine && <span className="font-medium text-foreground">{message.senderName}</span>}
            <time dateTime={date.toISOString()}>{clock(date)}</time>
          </p>
        )}
        <div
          className={`grid gap-1.5 rounded-2xl text-sm break-words whitespace-pre-wrap ${message.text ? "px-3.5 py-2" : "p-1"} ${
            mine ? "rounded-tr-md bg-brand/25" : "rounded-tl-md bg-muted"
          } ${message.status === "sending" ? "opacity-60" : ""}`}
        >
          {message.photos?.length > 0 && <Photos photos={message.photos} />}
          {message.text && (
            <span>
              <MessageText text={message.text} />
            </span>
          )}
        </div>
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

function MessageList({ items, people, selfId, hasMore, loadingEarlier, onRetry, onLoadEarlier, scrollRef }) {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      {hasMore && (
        <div className="mb-4 text-center">
          <Button variant="ghost" size="sm" disabled={loadingEarlier} onClick={onLoadEarlier}>
            {loadingEarlier ? "Loading…" : "Load earlier messages"}
          </Button>
        </div>
      )}
      <ol className="grid gap-1">
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
                message={message}
                mine={message.senderId === selfId}
                person={people.find((member) => member.id === message.senderId)}
                startsGroup={startsGroup}
                onRetry={onRetry}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SearchResults({ search, people, selfId }) {
  if (search.loading) {
    return (
      <p role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Searching…
      </p>
    );
  }
  if (!search.query) {
    return <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Type to search this conversation.</p>;
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <p role="status" className="mb-3 text-sm text-muted-foreground">
        {search.results.length
          ? `${search.results.length === 50 ? "Latest 50" : search.results.length} ${search.results.length === 1 ? "message" : "messages"} with "${search.query}"`
          : `No messages with "${search.query}".`}
      </p>
      <ol className="grid gap-3">
        {search.results.map((message) => (
          <li key={message.id}>
            <p className="mb-1 px-1 text-xs text-muted-foreground">{format(new Date(message.createdAt), "MMM d, h:mm a")}</p>
            <Bubble message={message} mine={message.senderId === selfId} person={people.find((member) => member.id === message.senderId)} startsGroup={false} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Composer({ value, onChange, photos, onAddPhotos, onRemovePhoto, onSend, onTyping, label, disabled }) {
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const tooLong = value.length > MESSAGE_MAX;
  const canSend = (value.trim() || photos.length) && !tooLong && !disabled;

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
      <div className="rounded-xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
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
            disabled={disabled || photos.length >= PHOTOS_MAX}
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
              if (event.target.value.trim()) onTyping?.();
            }}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter (or composing with an IME) adds a line.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
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
          <Button type="submit" size="icon" aria-label="Send" disabled={!canSend} className="size-10 rounded-lg bg-brand text-black hover:bg-brand/85">
            <SendHorizontal aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {tooLong ? (
          <span className="text-status-bad">Keep messages under {MESSAGE_MAX} characters.</span>
        ) : (
          <>
            <kbd className="font-sans font-semibold">Enter</kbd> to send · <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line
          </>
        )}
      </p>
    </form>
  );
}

const NO_THREAD = { id: null, messages: [], pending: [], hasMore: false, loadingEarlier: false, error: "" };
const NO_SEARCH = { conversationId: null, query: "", results: [], loading: false };

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
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const threadRef = useRef(thread);
  useEffect(() => {
    threadRef.current = thread;
  });

  const shownId = selectedId ?? list.conversations[0]?.id ?? null;
  const shown = list.conversations.find((conversation) => conversation.id === shownId) ?? null;
  const ready = thread.id === shownId;
  const searching = search.conversationId === shownId;
  const draft = drafts[shownId] ?? "";
  const photos = attachments[shownId] ?? [];
  const { typingNames, notifyTyping, stoppedTyping } = useTyping(shownId, profile.name, profile.id);
  // Set by the effects below, so real-time signals and timers can trigger the same loads.
  const reloadList = useRef(null);
  const pullNew = useRef(null);

  useInboxEvents((event) => {
    if (event?.type === "message" && event.conversationId === shownId) pullNew.current?.();
    reloadList.current?.();
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

  // The open conversation: first page, then new messages on each signal or backup check.
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

    loadMessages(shownId)
      .then((body) => {
        if (cancelled) return;
        stickToBottom.current = true;
        setThread({ ...NO_THREAD, id: shownId, messages: body.messages, hasMore: body.hasMore });
        seen();
      })
      .catch((error) => !cancelled && setThread({ ...NO_THREAD, id: shownId, error: error.message }));

    function pull() {
      const current = threadRef.current;
      if (current.id !== shownId) return;
      const after = current.messages.at(-1)?.id;
      loadMessages(shownId, { after })
        .then((body) => {
          if (cancelled || !body.messages.length) return;
          const box = scrollRef.current;
          stickToBottom.current = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
          setThread((latest) => {
            if (latest.id !== shownId) return latest;
            const known = new Set(latest.messages.map((message) => message.id));
            return { ...latest, messages: [...latest.messages, ...body.messages.filter((message) => !known.has(message.id))] };
          });
          seen();
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
  }, [thread.messages, thread.pending]);

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

  function setDraft(text) {
    setDrafts((current) => ({ ...current, [shownId]: text }));
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

  async function deliver(conversationId, pending) {
    try {
      // Photos go to Cloudinary first (once, even if sending is retried).
      const uploaded = pending.uploaded ?? (pending.files?.length ? await uploadPhotos(pending.files, "chat") : []);
      pending.uploaded = uploaded;
      const saved = await sendChatMessage(conversationId, pending.text, uploaded);
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

  function send() {
    const text = draft.trim();
    const pending = {
      id: `pending-${crypto.randomUUID()}`,
      senderId: profile.id,
      senderName: profile.name,
      text,
      photos: photos.map((photo) => ({ url: photo.preview })),
      files: photos.map((photo) => photo.file),
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    stickToBottom.current = true;
    setThread((latest) => ({ ...latest, pending: [...latest.pending, pending] }));
    setDraft("");
    setAttachments((current) => ({ ...current, [shownId]: [] }));
    stoppedTyping();
    deliver(shownId, pending);
  }

  function retry(message) {
    const again = { ...message, status: "sending" };
    setThread((latest) => ({ ...latest, pending: latest.pending.map((item) => (item.id === message.id ? again : item)) }));
    deliver(shownId, again);
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

            {searching ? (
              <SearchResults search={{ ...search, query: search.query.trim() }} people={list.people} selfId={profile.id} />
            ) : !ready ? (
              <p role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Loading messages…
              </p>
            ) : thread.error ? (
              <p role="alert" className="flex flex-1 items-center justify-center text-sm text-status-bad">
                {thread.error}
              </p>
            ) : items.length === 0 ? (
              <EmptyState conversation={shown} onSuggest={setDraft} />
            ) : (
              <MessageList
                items={items}
                people={list.people}
                selfId={profile.id}
                hasMore={thread.hasMore}
                loadingEarlier={thread.loadingEarlier}
                onRetry={retry}
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
    </div>
  );
}
