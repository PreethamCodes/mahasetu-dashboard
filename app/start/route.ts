import { NextResponse } from "next/server";
import { core, CoreError } from "../../lib/core";
import { setSession } from "../../lib/session";
import { Grant } from "../../lib/schemas";

export const dynamic = "force-dynamic";

function go(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/** Launch link from a requesting service: /start?ref=<launch reference>. The reference never reaches the page. */
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref") ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(ref)) return go("/problem?c=LAUNCH_INVALID");
  try {
    const grant = await core("/v1/applicant/sessions", {
      method: "POST",
      server: true,
      body: { launch_reference: ref },
      schema: Grant,
    });
    await setSession(grant.session_token, grant.session_expires_at);
    return go("/verify");
  } catch (error) {
    const code = error instanceof CoreError ? error.code : "CORE_UNAVAILABLE";
    return go("/problem?c=" + encodeURIComponent(code));
  }
}
