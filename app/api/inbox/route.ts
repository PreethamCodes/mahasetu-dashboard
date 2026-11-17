import { z } from "zod";
import { config } from "../../../lib/config";
import { core, CoreError } from "../../../lib/core";
import { MessageList } from "../../../lib/schemas";

export const dynamic = "force-dynamic";

/** Demonstration inbox feed. Disabled unless DEMO_MESSAGE_INBOX=enabled. */
export async function GET(request: Request) {
  if (!config().inboxEnabled) return Response.json({ code: "NOT_FOUND", message: "Not found." }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const tx = query.get("tx");
  const cursor = query.get("cursor");
  if ((tx && !z.uuid().safeParse(tx).success) || (cursor && !/^[A-Za-z0-9_=-]{1,256}$/.test(cursor))) {
    return Response.json({ code: "INVALID_REQUEST", message: "Invalid request." }, { status: 400 });
  }
  const params = new URLSearchParams({ limit: "20" });
  if (tx) params.set("transaction_reference", tx);
  if (cursor) params.set("cursor", cursor);
  try {
    return Response.json(await core(`/v1/messages?${params}`, { server: true, schema: MessageList }));
  } catch (error) {
    const e = error instanceof CoreError ? error : new CoreError(500, "INTERNAL_ERROR", "Something went wrong.");
    return Response.json({ code: e.code, message: e.message }, { status: e.status });
  }
}
