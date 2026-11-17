import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "../../lib/config";
import { core, CoreError, safeReturnUrl } from "../../lib/core";
import { Completion, Overview, Report } from "../../lib/schemas";
import { sessionToken } from "../../lib/session";

export const dynamic = "force-dynamic";

type Tone = "ok" | "bad" | "warn" | "neutral";
const OUTCOMES: Record<string, { tone: Tone; title: string; text: string }> = {
  VERIFIED: { tone: "ok", title: "Verified", text: "Every requirement was met. You can continue your application." },
  FAILED_CHECK: { tone: "bad", title: "Not verified", text: "One or more requirements were not met. The reasons are listed below." },
  PARTIAL: { tone: "warn", title: "Partly verified", text: "Some checks passed, but others could not be completed yet." },
  INSUFFICIENT_DATA: { tone: "warn", title: "Not enough information", text: "A department had no record for you, or was not checked." },
  PROVIDER_ERROR: { tone: "warn", title: "Could not be completed", text: "A department was unavailable. Nothing was marked as failed, so you can try again later." },
  MANUAL_REVIEW: { tone: "warn", title: "Needs a manual check", text: "A record did not match your details, so a person has to look at it." },
  ACCESS_DENIED: { tone: "neutral", title: "Nothing was verified", text: "No department was given permission, so no records were fetched." },
  RULES_NOT_CONFIGURED: { tone: "neutral", title: "Not available yet", text: "No approved rules exist for this scheme yet." },
  CANCELLED: { tone: "neutral", title: "Cancelled", text: "This verification was cancelled." },
};
const TERMINAL = new Set(Object.keys(OUTCOMES));

export default async function Result() {
  const session = await sessionToken();
  if (!session) redirect("/problem?c=SESSION_REQUIRED");
  let data: { overview: Overview; report: Report; completion: Completion } | undefined;
  let problem = "";
  try {
    const overview = await core("/v1/applicant/session", { session, schema: Overview });
    if (TERMINAL.has(overview.state)) {
      // Completing an already finished verification is safe: Core returns the same result.
      const completion = await core("/v1/applicant/session/complete", { method: "POST", session, schema: Completion });
      const report = await core("/v1/applicant/session/result", { session, schema: Report });
      data = { overview, report, completion };
    }
  } catch (error) {
    problem = error instanceof CoreError ? error.code : "CORE_UNAVAILABLE";
  }
  if (problem) redirect("/problem?c=" + encodeURIComponent(problem));
  if (!data) redirect("/verify");

  const { overview, report, completion } = data;
  const outcome = OUTCOMES[report.state] ?? OUTCOMES.FAILED_CHECK;
  const names = new Map(overview.departments.map((d) => [d.provider_id, d.display_name]));
  const attention = report.checks.filter((c) => c.outcome !== "PASS");
  const passed = report.checks.filter((c) => c.outcome === "PASS");
  const returnUrl = safeReturnUrl(completion.return_url);

  return (
    <>
      <section className={`result ${outcome.tone}`} aria-labelledby="result-h">
        <p className="overline">Result for {overview.service_name}</p>
        <h1 id="result-h" data-state={report.state}>{outcome.title}</h1>
        <p className="lead">{outcome.text}</p>
      </section>

      {attention.length ? (
        <section className="checks" aria-labelledby="attention-h">
          <h2 id="attention-h">{report.state === "FAILED_CHECK" ? "Why it was not verified" : "What needs attention"}</h2>
          <ul>
            {attention.map((c, i) => (
              <li key={i} className={c.outcome === "FAIL" ? "bad" : "warn"}>
                <span className="mark" aria-hidden="true">{c.outcome === "FAIL" ? "✕" : "!"}</span>
                <span>
                  <strong>{c.message}</strong>
                  <small>{c.provider_id === "mahasetu" ? "MahaSetu" : (names.get(c.provider_id) ?? c.provider_id)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {passed.length ? (
        <section className="checks" aria-labelledby="passed-h">
          <details open={report.state === "VERIFIED"}>
            <summary><h2 id="passed-h">Passed checks ({passed.length})</h2></summary>
            <ul>
              {passed.map((c, i) => (
                <li key={i} className="ok">
                  <span className="mark" aria-hidden="true">{"✓"}</span>
                  <span>
                    <strong>{c.message}</strong>
                    <small>{names.get(c.provider_id) ?? c.provider_id}</small>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {completion.message_queued ? (
        <p className="sms">
          We sent an SMS with these reasons to <strong>{overview.mobile_masked}</strong>.{" "}
          {config().inboxEnabled ? <Link href={`/messages?tx=${overview.transaction_reference}`}>See it in the demo SMS inbox</Link> : null}
        </p>
      ) : null}

      <p className="actions">
        {returnUrl ? <a className="button" href={returnUrl}>Return to {overview.service_name}</a> : null}
      </p>
      <p className="hint">Reference {overview.transaction_reference.slice(0, 8).toUpperCase()}. Keep it if you need to ask about this result.</p>
    </>
  );
}
