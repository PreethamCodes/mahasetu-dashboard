import Link from "next/link";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, [string, string]> = {
  LAUNCH_INVALID: ["This link is not valid", "Open MahaSetu again from the service you are applying to."],
  LAUNCH_NOT_FOUND: ["This link is not valid", "It may have been replaced by a newer one. Start again from the service you are applying to."],
  LAUNCH_EXPIRED: ["This link has expired", "For your safety links last a short time. Start again from the service you are applying to."],
  SESSION_REQUIRED: ["Your session has ended", "Start again from the service you are applying to."],
  SESSION_INVALID: ["Your session has ended", "Start again from the service you are applying to."],
  SESSION_EXPIRED: ["Your session has ended", "For your safety sessions last a short time. Start again from the service you are applying to."],
  CORE_UNAVAILABLE: ["MahaSetu is not reachable right now", "Nothing was shared. Please try again in a few minutes."],
  SERVER_NOT_CONFIGURED: ["MahaSetu is not set up yet", "The site could not connect to the MahaSetu service. Tell the person running the demonstration."],
};

export default async function Problem({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const code = (await searchParams).c ?? "";
  const [title, text] = MESSAGES[code] ?? ["Something went wrong", "Please start again from the service you are applying to."];
  return (
    <section className="intro">
      <p className="overline">MahaSetu</p>
      <h1>{title}</h1>
      <p className="lead">{text}</p>
      <p className="actions"><Link className="button quiet" href="/">Go to the MahaSetu home page</Link></p>
    </section>
  );
}
