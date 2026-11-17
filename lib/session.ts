import "server-only";
import { cookies } from "next/headers";
import { config } from "./config";

export const COOKIE = "ms_session";

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function setSession(token: string, expiresAt: string) {
  const maxAge = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config().cookieSecure,
    path: "/",
    maxAge,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
