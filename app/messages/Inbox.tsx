"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Message } from "../../lib/schemas";

type Page = { messages: Message[]; next_cursor: string | null };

const KIND: Record<Message["kind"], string> = { OTP: "One-time code", VERIFICATION_RESULT: "Verification result" };

function time(value: string) {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });
}

export default function Inbox({ initial, tx }: { initial: Page; tx?: string }) {
  const [page, setPage] = useState(initial);
  const [extra, setExtra] = useState<Message[]>([]);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [failed, setFailed] = useState(false);

  // The newest page refreshes by itself so a code or result appears without reloading.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/inbox" + (tx ? `?tx=${tx}` : ""), { cache: "no-store" });
        if (!response.ok) throw new Error();
        setPage((await response.json()) as Page);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [tx]);

  async function more() {
    if (!cursor) return;
    const response = await fetch(`/api/inbox?cursor=${encodeURIComponent(cursor)}${tx ? `&tx=${tx}` : ""}`, { cache: "no-store" });
    if (!response.ok) return;
    const next = (await response.json()) as Page;
    setExtra((list) => [...list, ...next.messages]);
    setCursor(next.next_cursor);
  }

  const seen = new Set(page.messages.map((m) => m.message_reference));
  const messages = [...page.messages, ...extra.filter((m) => !seen.has(m.message_reference))];

  return (
    <section aria-label="Messages">
      <p className="row inboxbar">
        <span className="hint" role="status">{tx ? "Messages for one verification." : "All recent messages."} Updates every few seconds.{failed ? " Could not refresh." : ""}</span>
        {tx ? <Link className="link" href="/messages">Show all messages</Link> : null}
      </p>
      {messages.length === 0 ? <p className="notice">No messages yet.</p> : null}
      <ol className="sms-list">
        {messages.map((m) => (
          <li key={m.message_reference} className={`sms-item ${m.kind === "OTP" ? "otp" : "result"}`} data-kind={m.kind}>
            <div className="smshead">
              <strong>{KIND[m.kind]}</strong>
              <span>to {m.recipient_masked}</span>
              <time dateTime={m.created_at} suppressHydrationWarning>{time(m.created_at)}</time>
            </div>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      {cursor ? <p className="actions"><button type="button" className="button quiet" onClick={() => void more()}>Show older messages</button></p> : null}
    </section>
  );
}
