import { notFound } from "next/navigation";
import { z } from "zod";
import { config } from "../../lib/config";
import { core, CoreError } from "../../lib/core";
import { MessageList } from "../../lib/schemas";
import Inbox from "./Inbox";

export const dynamic = "force-dynamic";

export default async function Messages({ searchParams }: { searchParams: Promise<{ tx?: string }> }) {
  if (!config().inboxEnabled) notFound();
  const raw = (await searchParams).tx;
  const tx = raw && z.uuid().safeParse(raw).success ? raw : undefined;
  let initial: z.infer<typeof MessageList> | undefined;
  let problem = "";
  try {
    initial = await core(`/v1/messages?limit=20${tx ? `&transaction_reference=${tx}` : ""}`, { server: true, schema: MessageList });
  } catch (error) {
    problem = error instanceof CoreError ? error.message : "The messages could not be loaded.";
  }
  return (
    <>
      <section className="intro">
        <p className="overline">Demonstration only</p>
        <h1>SMS inbox</h1>
        <p className="lead">
          MahaSetu does not send real text messages here. This page shows what the applicant&rsquo;s phone would receive:
          one-time codes and the reasons when a verification is not approved.
        </p>
      </section>
      {initial ? <Inbox initial={initial} tx={tx} /> : <p className="notice error" role="alert">{problem}</p>}
    </>
  );
}
