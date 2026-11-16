import { can } from "@/lib/permissions";
import { conversationAccess, deleteMessage, editMessage, MESSAGE_MAX, MessageRefused, toId } from "@/lib/server/chat";

function refused(error) {
  if (error instanceof MessageRefused) return Response.json({ success: false, error: error.message }, { status: error.status });
  return null;
}

// PATCH /api/chat/:id/messages/:messageId: { text } edits your own message.
export async function PATCH(request, { params }) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length > MESSAGE_MAX) {
    return Response.json({ success: false, error: `Keep messages under ${MESSAGE_MAX} characters` }, { status: 400 });
  }
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    const message = await editMessage(access.db, access.user, access.conversation, toId((await params).messageId), text);
    return Response.json({ success: true, message });
  } catch (error) {
    const response = refused(error);
    if (response) return response;
    console.error("Editing message failed", error);
    return Response.json({ success: false, error: "Couldn't edit the message" }, { status: 500 });
  }
}

// DELETE /api/chat/:id/messages/:messageId: deletes your own message (owners can delete any).
export async function DELETE(request, { params }) {
  try {
    const access = await conversationAccess(params);
    if (access.denied) return access.denied;
    const message = await deleteMessage(
      access.db,
      access.user,
      access.conversation,
      toId((await params).messageId),
      can(access.user, "staff.manage"),
    );
    return Response.json({ success: true, message });
  } catch (error) {
    const response = refused(error);
    if (response) return response;
    console.error("Deleting message failed", error);
    return Response.json({ success: false, error: "Couldn't delete the message" }, { status: 500 });
  }
}
