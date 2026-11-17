import Link from "next/link";
import { config } from "../lib/config";
import { sessionToken } from "../lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const active = Boolean(await sessionToken());
  return (
    <section className="intro">
      <p className="overline">Verify with MahaSetu</p>
      <h1>One check, many departments.</h1>
      <p className="lead">
        When a government service needs proof from other departments, such as income, examination results or
        enrolment, MahaSetu asks you for permission, fetches only those records and tells the service whether the
        requirements are met.
      </p>
      <ol className="steps">
        <li><strong>Start from the service.</strong> Choose <em>Verify with MahaSetu</em> on the application page.</li>
        <li><strong>Give permission.</strong> For each department, confirm with a code sent to your mobile.</li>
        <li><strong>See the result.</strong> You get the outcome with the reasons, and return to the service.</li>
      </ol>
      <p className="actions">
        {active ? <Link className="button" href="/verify">Continue your verification</Link> : null}
        {config().inboxEnabled ? <Link className="button quiet" href="/messages">Open the demo SMS inbox</Link> : null}
      </p>
      {active ? null : <p className="hint">There is nothing to verify here yet. Open this site from the service you are applying to.</p>}
    </section>
  );
}
