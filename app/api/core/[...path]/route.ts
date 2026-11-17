import { z } from "zod";
import { core, CoreError, safeReturnUrl } from "../../../../lib/core";
import { sessionToken } from "../../../../lib/session";
import { Card, Challenge, Completion, Overview, Verified } from "../../../../lib/schemas";

export const dynamic = "force-dynamic";

const DEPARTMENT = "([a-z][a-z0-9-]{1,40})";
const BASE = "/v1/applicant/session";
const OtpBody = z.object({ challenge_reference: z.uuid(), code: z.string().regex(/^[0-9]{6}$/) }).strict();

type Route = { method: "GET" | "POST"; pattern: RegExp; target: (m: RegExpMatchArray) => string; schema: z.ZodType<unknown>; body?: z.ZodType<unknown> };

/** Allowlist: the browser can reach only these applicant operations, always with its own session. */
const ROUTES: Route[] = [
  { method: "GET", pattern: /^overview$/, target: () => BASE, schema: Overview },
  { method: "POST", pattern: new RegExp(`^departments/${DEPARTMENT}/otp$`), target: (m) => `${BASE}/departments/${m[1]}/otp`, schema: Challenge },
  { method: "POST", pattern: new RegExp(`^departments/${DEPARTMENT}/otp/verify$`), target: (m) => `${BASE}/departments/${m[1]}/otp/verify`, schema: Verified, body: OtpBody },
  { method: "POST", pattern: new RegExp(`^departments/${DEPARTMENT}/verify$`), target: (m) => `${BASE}/departments/${m[1]}/verify`, schema: Card },
  { method: "POST", pattern: new RegExp(`^departments/${DEPARTMENT}/decline$`), target: (m) => `${BASE}/departments/${m[1]}/decline`, schema: Card },
  { method: "POST", pattern: /^complete$/, target: () => `${BASE}/complete`, schema: Completion },
];

function fail(status: number, code: string, message: string, extra?: HeadersInit, retryable = false) {
  return Response.json({ code, message, retryable }, { status, headers: extra });
}

/** A cross-site page cannot send this header or a matching Origin, so it cannot act for the applicant. */
function sameSite(request: Request) {
  if (request.method === "GET") return true;
  if (request.headers.get("x-requested-with") !== "mahasetu") return false;
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === request.headers.get("host");
}

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const route = ROUTES.find((r) => r.method === request.method && r.pattern.test(path));
  if (!route) return fail(404, "NOT_FOUND", "That action does not exist.");
  if (!sameSite(request)) return fail(403, "CROSS_SITE_REQUEST", "This request was blocked.");
  const session = await sessionToken();
  if (!session) return fail(401, "SESSION_REQUIRED", "Your session has ended. Start again from the requesting service.");
  let body: unknown;
  if (route.body) {
    const parsed = route.body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(400, "INVALID_REQUEST", "Enter the six-digit code.");
    body = parsed.data;
  }
  try {
    const data = await core(route.target(path.match(route.pattern)!), { method: route.method, session, body, schema: route.schema });
    if (route.schema === Completion) {
      const done = data as z.infer<typeof Completion>;
      const returnUrl = safeReturnUrl(done.return_url);
      if (!returnUrl) return fail(502, "CORE_BAD_RESPONSE", "MahaSetu sent an unexpected answer.", undefined, true);
      return Response.json({ ...done, return_url: returnUrl });
    }
    return Response.json(data);
  } catch (error) {
    if (error instanceof CoreError) {
      return fail(error.status, error.code, error.message, error.retryAfter ? { "Retry-After": error.retryAfter } : undefined, error.retryable);
    }
    return fail(500, "INTERNAL_ERROR", "Something went wrong. Please try again.", undefined, true);
  }
}

export { handle as GET, handle as POST };
