import { ObjectId } from "mongodb";
import { roleLabel } from "@/lib/permissions";
import { forbidden, requireAccess } from "@/lib/server/auth";
import { CHAT_PHOTO_FOLDER, isOwnPhoto } from "@/lib/server/cloudinary";
import { getDb } from "@/lib/server/mongodb";
import { announce, tokenRequestFor } from "@/lib/server/realtime";

// Staff chat. Conversations are an "All staff" channel, one channel per branch, and direct
// messages between two people. Everything is in MongoDB. Browsers hear about new messages
// through Ably when it's set up (see realtime.js), and poll as a backup.
//   conversations: { key (unique), type: "channel"|"direct", name?, branchCode?, members?, lastMessage }
//   messages:      { conversationId, senderId, senderName, text, photos?, createdAt }
//   chat_reads:    { userId, conversationId, lastReadAt, muted? }

export const MESSAGE_MAX = 4000;
export const PHOTOS_MAX = 6;
const PAGE = 50;
const ALL_STAFF = "channel:all";

// People who can sign in: activated and not deactivated.
const ACTIVE = { disabled: { $ne: true }, passwordHash: { $exists: true } };

export function toId(value) {
  return typeof value === "string" && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

export function canAccess(user, conversation) {
  if (!conversation) return false;
  if (conversation.type === "direct") return conversation.members.some((member) => member.equals(user._id));
  if (conversation.key === ALL_STAFF) return true;
  // Staff on all branches (e.g. the owner) see every branch channel.
  return !user.branch?.code || user.branch.code === conversation.branchCode;
}

// The team, for avatars, names and starting a direct message.
export async function directory(db) {
  const users = await db
    .collection("users")
    .find(ACTIVE, { projection: { name: 1, role: 1, branch: 1, photo: 1 } })
    .sort({ name: 1 })
    .toArray();
  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    title: roleLabel(user.role),
    branch: user.branch?.name ?? "All branches",
    branchCode: user.branch?.code ?? null,
    photo: user.photo?.url ?? "",
  }));
}

// Who's in a conversation, from the team directory.
function memberIds(conversation, people) {
  if (conversation.type === "direct") return conversation.members.map(String);
  if (conversation.key === ALL_STAFF) return people.map((person) => person.id);
  return people
    .filter((person) => !person.branchCode || person.branchCode === conversation.branchCode)
    .map((person) => person.id);
}

// Makes sure the All staff channel and one channel per branch people work at exist.
async function ensureChannels(db) {
  const branches = await db.collection("users").aggregate([
    { $match: { ...ACTIVE, "branch.code": { $type: "string" } } },
    { $group: { _id: "$branch.code", name: { $first: "$branch.name" } } },
  ]).toArray();
  const channels = [
    { key: ALL_STAFF, name: "All staff" },
    ...branches.map((branch) => ({ key: `channel:branch:${branch._id}`, name: branch.name, branchCode: branch._id })),
  ];
  const now = new Date();
  await db.collection("conversations").bulkWrite(
    channels.map(({ key, ...fields }) => ({
      updateOne: {
        filter: { key },
        // The name follows the branch if it's renamed on the Routes page.
        update: { $setOnInsert: { key, type: "channel", createdAt: now }, $set: fields },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function visibleConversations(db, user) {
  await ensureChannels(db);
  const branchChannels = user.branch?.code
    ? { key: `channel:branch:${user.branch.code}` }
    : { key: { $regex: "^channel:branch:" } };
  return db
    .collection("conversations")
    .find({ $or: [{ key: ALL_STAFF }, branchChannels, { type: "direct", members: user._id }] })
    .toArray();
}

async function readStates(db, user, conversations) {
  const reads = await db
    .collection("chat_reads")
    .find({ userId: user._id, conversationId: { $in: conversations.map((c) => c._id) } })
    .toArray();
  return new Map(reads.map((read) => [String(read.conversationId), read]));
}

// Messages from others since the user last opened the conversation (capped at 100).
async function unreadCounts(db, user, conversations, reads) {
  const lastRead = new Map([...reads].map(([id, read]) => [id, read.lastReadAt]));
  const messages = db.collection("messages");
  return Promise.all(
    conversations.map(async (conversation) => {
      const since = lastRead.get(String(conversation._id));
      if (!conversation.lastMessage || (since && conversation.lastMessage.at <= since)) return 0;
      return messages.countDocuments(
        { conversationId: conversation._id, senderId: { $ne: user._id }, ...(since && { createdAt: { $gt: since } }) },
        { limit: 100 },
      );
    }),
  );
}

function otherMember(conversation, user, people) {
  const other = conversation.members.find((member) => !member.equals(user._id));
  return people.find((person) => person.id === String(other)) ?? null;
}

// What the chat list shows, channels first (All staff, then branches A–Z), then direct
// messages, most recent first.
export async function listConversations(db, user) {
  const [conversations, people] = await Promise.all([visibleConversations(db, user), directory(db)]);
  const reads = await readStates(db, user, conversations);
  const unread = await unreadCounts(db, user, conversations, reads);
  const rows = conversations.map((conversation, index) => {
    const person = conversation.type === "direct" ? otherMember(conversation, user, people) : null;
    return {
      id: String(conversation._id),
      type: conversation.type,
      name: person?.name ?? conversation.name ?? "Former staff member",
      withId: person?.id ?? null,
      lastMessage: conversation.lastMessage ?? null,
      unread: unread[index],
      muted: Boolean(reads.get(String(conversation._id))?.muted),
      memberIds: memberIds(conversation, people),
      all: conversation.key === ALL_STAFF,
    };
  });
  const channels = rows
    .filter((row) => row.type === "channel")
    .sort((a, b) => Number(b.all) - Number(a.all) || a.name.localeCompare(b.name));
  const direct = rows
    .filter((row) => row.type === "direct")
    .sort((a, b) => new Date(b.lastMessage?.at ?? 0) - new Date(a.lastMessage?.at ?? 0));
  return { conversations: [...channels, ...direct], people };
}

// For the sidebar badge. Muted conversations don't count.
export async function unreadTotal(db, user) {
  const all = await visibleConversations(db, user);
  const reads = await readStates(db, user, all);
  const conversations = all.filter((conversation) => !reads.get(String(conversation._id))?.muted);
  return (await unreadCounts(db, user, conversations, reads)).reduce((sum, count) => sum + count, 0);
}

export async function setMuted(db, user, conversationId, muted) {
  await db
    .collection("chat_reads")
    .updateOne({ userId: user._id, conversationId }, { $set: { muted } }, { upsert: true });
}

// Photos attached to a message: only ones uploaded to our chat folder.
export function parsePhotos(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > PHOTOS_MAX || !value.every((photo) => isOwnPhoto(photo, CHAT_PHOTO_FOLDER))) {
    return null;
  }
  return value.map(({ url, publicId, width, height }) => ({
    url,
    publicId,
    width: Number(width) || null,
    height: Number(height) || null,
  }));
}

// Everyone who can see a conversation, i.e. who should hear about new messages in it.
async function recipientIds(db, conversation) {
  if (conversation.type === "direct") return conversation.members.map(String);
  const filter =
    conversation.key === ALL_STAFF
      ? ACTIVE
      : { ...ACTIVE, $or: [{ "branch.code": conversation.branchCode }, { "branch.code": { $exists: false } }, { branch: null }] };
  const users = await db.collection("users").find(filter, { projection: { _id: 1 } }).toArray();
  return users.map((user) => String(user._id));
}

// An Ably token for this person, covering only the conversations they can see.
export async function realtimeTokenFor(db, user) {
  const conversations = await visibleConversations(db, user);
  return tokenRequestFor(user, conversations.map((conversation) => String(conversation._id)));
}

// The direct conversation between two people, created the first time either opens it.
export async function directConversation(db, user, otherId) {
  const other = await db.collection("users").findOne({ _id: otherId, ...ACTIVE });
  if (!other) return null;
  const members = [user._id, other._id].sort((a, b) => String(a).localeCompare(String(b)));
  const key = `dm:${members.join(":")}`;
  const conversations = db.collection("conversations");
  try {
    const result = await conversations.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, type: "direct", members, createdAt: new Date() } },
      { upsert: true, returnDocument: "after", includeResultMetadata: true },
    );
    // A brand-new conversation: both people's tabs need a fresh pass that includes it.
    if (!result.lastErrorObject?.updatedExisting) {
      announce(members.map(String), { type: "conversation", conversationId: String(result.value._id) });
    }
    return result.value;
  } catch (error) {
    // Both people opened it at the same moment: the other request created it.
    if (error?.code === 11000) return conversations.findOne({ key });
    throw error;
  }
}

function messageOut(message) {
  return {
    id: String(message._id),
    senderId: String(message.senderId),
    senderName: message.senderName,
    text: message.text,
    photos: (message.photos ?? []).map(({ url, width, height }) => ({ url, width, height })),
    createdAt: message.createdAt,
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Messages containing `query` (any case), newest 50, shown oldest first.
export async function searchMessages(db, conversationId, query) {
  const rows = await db
    .collection("messages")
    .find({ conversationId, text: { $regex: escapeRegex(query), $options: "i" } })
    .sort({ _id: -1 })
    .limit(PAGE)
    .toArray();
  return rows.reverse().map(messageOut);
}

// Oldest first. `after`: only newer messages (polling). `before`: the page before it (scrolling up).
export async function listMessages(db, conversationId, { after, before } = {}) {
  const messages = db.collection("messages");
  if (after) {
    const rows = await messages
      .find({ conversationId, _id: { $gt: after } })
      .sort({ _id: 1 })
      .limit(PAGE * 2)
      .toArray();
    return { messages: rows.map(messageOut), hasMore: false };
  }
  const rows = await messages
    .find({ conversationId, ...(before && { _id: { $lt: before } }) })
    .sort({ _id: -1 })
    .limit(PAGE + 1)
    .toArray();
  return { messages: rows.slice(0, PAGE).reverse().map(messageOut), hasMore: rows.length > PAGE };
}

export async function markRead(db, user, conversationId, at = new Date()) {
  await db
    .collection("chat_reads")
    .updateOne({ userId: user._id, conversationId }, { $set: { lastReadAt: at } }, { upsert: true });
}

export async function sendMessage(db, user, conversation, text, photos = []) {
  const now = new Date();
  const message = {
    conversationId: conversation._id,
    senderId: user._id,
    senderName: user.name,
    text,
    ...(photos.length && { photos }),
    createdAt: now,
  };
  const preview = text || (photos.length === 1 ? "📷 Photo" : `📷 ${photos.length} photos`);
  const { insertedId } = await db.collection("messages").insertOne(message);
  // Independent of each other, so they run together (each is a round trip to the database).
  const [, , recipients] = await Promise.all([
    db.collection("conversations").updateOne(
      { _id: conversation._id },
      { $set: { lastMessage: { text: preview.slice(0, 140), senderName: user.name, at: now } } },
    ),
    markRead(db, user, conversation._id, now),
    recipientIds(db, conversation),
  ]);
  // Ids only: everyone's screens load the text from our API.
  announce(recipients, {
    type: "message",
    conversationId: String(conversation._id),
    messageId: String(insertedId),
  });
  return messageOut({ ...message, _id: insertedId });
}

// For /api/chat/:id routes: the signed-in user and the conversation in the URL, or a ready
// error response in `denied`.
export async function conversationAccess(params) {
  const access = await requireAccess("chat.use");
  if (access.denied) return access;
  const id = toId((await params).id);
  const db = await getDb();
  const conversation = id && (await db.collection("conversations").findOne({ _id: id }));
  if (!conversation) {
    return { denied: Response.json({ success: false, error: "Conversation not found" }, { status: 404 }) };
  }
  if (!canAccess(access.user, conversation)) return { denied: forbidden() };
  return { ...access, db, conversation };
}
