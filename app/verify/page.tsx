import { redirect } from "next/navigation";
import { config } from "../../lib/config";
import { core, CoreError } from "../../lib/core";
import { Overview } from "../../lib/schemas";
import { sessionToken } from "../../lib/session";
import Verification from "./Verification";

export const dynamic = "force-dynamic";
const TERMINAL = new Set(["VERIFIED", "FAILED_CHECK", "PARTIAL", "MANUAL_REVIEW", "INSUFFICIENT_DATA", "RULES_NOT_CONFIGURED", "ACCESS_DENIED", "PROVIDER_ERROR", "CANCELLED"]);

export default async function Verify() {
  const session = await sessionToken();
  if (!session) redirect("/problem?c=SESSION_REQUIRED");
  let overview: Overview | undefined;
  let problem = "";
  try {
    overview = await core("/v1/applicant/session", { session, schema: Overview });
  } catch (error) {
    problem = error instanceof CoreError ? error.code : "CORE_UNAVAILABLE";
  }
  if (!overview) redirect("/problem?c=" + encodeURIComponent(problem));
  if (TERMINAL.has(overview.state)) redirect("/result");
  return <Verification initial={overview} inboxEnabled={config().inboxEnabled} />;
}
