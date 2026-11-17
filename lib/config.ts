/** Read lazily so a build without the runtime environment succeeds. */
export function config() {
  return {
    coreUrl: (process.env.CORE_API_URL ?? "http://localhost:8000").replace(/\/+$/, ""),
    dashboardToken: process.env.DASHBOARD_CLIENT_TOKEN ?? "",
    cookieSecure: (process.env.COOKIE_SECURE ?? "true").toLowerCase() !== "false",
    inboxEnabled: (process.env.DEMO_MESSAGE_INBOX ?? "enabled").toLowerCase() === "enabled",
  };
}
