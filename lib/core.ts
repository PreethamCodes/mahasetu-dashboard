import "server-only";
import { z } from "zod";
import { config } from "./config";

export class CoreError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
    public retryAfter?: string,
  ) {
    super(message);
  }
}

const ErrorBody = z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() });

type Options<T> = {
  method?: "GET" | "POST";
  /** Applicant session token (never sent to the browser). */
  session?: string;
  /** Use the website's server credential instead of an applicant session. */
  server?: boolean;
  body?: unknown;
  schema: z.ZodType<T>;
};

/** Call MahaSetu Core from the server. Failures become CoreError; Core's body is validated before use. */
export async function core<T>(path: string, o: Options<T>): Promise<T> {
  const { coreUrl, dashboardToken } = config();
  const token = o.server ? dashboardToken : o.session;
  if (!token) throw new CoreError(401, o.server ? "SERVER_NOT_CONFIGURED" : "SESSION_REQUIRED", "Not signed in.");
  let response: Response;
  try {
    response = await fetch(coreUrl + path, {
      method: o.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(o.body ? { "Content-Type": "application/json" } : {}) },
      body: o.body ? JSON.stringify(o.body) : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CoreError(503, "CORE_UNAVAILABLE", "MahaSetu could not be reached. Please try again in a moment.", true);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ErrorBody.safeParse(payload);
    if (!error.success) throw new CoreError(502, "CORE_BAD_RESPONSE", "MahaSetu sent an unexpected answer.", true);
    throw new CoreError(
      response.status,
      error.data.code,
      error.data.message,
      error.data.retryable ?? false,
      response.headers.get("retry-after") ?? undefined,
    );
  }
  const parsed = o.schema.safeParse(payload);
  if (!parsed.success) throw new CoreError(502, "CORE_BAD_RESPONSE", "MahaSetu sent an unexpected answer.", true);
  return parsed.data;
}

export function safeReturnUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
