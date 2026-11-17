"use client";
import { useCallback, useEffect, useState } from "react";
import type { Card, Challenge, Overview } from "../../lib/schemas";

class Failure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TERMINAL = ["VERIFIED", "FAILED_CHECK", "PARTIAL", "MANUAL_REVIEW", "INSUFFICIENT_DATA", "RULES_NOT_CONFIGURED", "ACCESS_DENIED", "PROVIDER_ERROR", "CANCELLED"];

async function api<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/core/" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Requested-With": "mahasetu" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Failure(response.status, data?.code ?? "ERROR", data?.message ?? "Something went wrong. Please try again.");
  return data as T;
}

const LABEL: Record<Card["status"], string> = {
  NOT_STARTED: "Not verified",
  OTP_SENT: "Code sent",
  AUTHORIZED: "Permission given",
  RETRIEVING: "Checking",
  COMPLETED: "Records received",
  DECLINED: "Declined",
  UNAVAILABLE: "Unavailable",
};
const TONE: Record<Card["status"], string> = {
  NOT_STARTED: "neutral", OTP_SENT: "info", AUTHORIZED: "info", RETRIEVING: "info",
  COMPLETED: "ok", DECLINED: "neutral", UNAVAILABLE: "attention",
};

type Ui = { busy?: boolean; challenge?: Challenge; code?: string; error?: string };
const key = (tx: string, provider: string) => `ms:${tx}:${provider}`;

function remaining(until: string | undefined, now: number) {
  return until ? Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000)) : 0;
}

export default function Verification({ initial, inboxEnabled }: { initial: Overview; inboxEnabled: boolean }) {
  const [overview, setOverview] = useState(initial);
  const [ui, setUi] = useState<Record<string, Ui>>({});
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tx = overview.transaction_reference;
  const patch = (provider: string, change: Ui) => setUi((u) => ({ ...u, [provider]: { ...u[provider], ...change } }));

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<Overview>("overview");
      if (TERMINAL.includes(fresh.state)) {
        window.location.assign("/result");
        return;
      }
      setOverview(fresh);
    } catch (error) {
      if (error instanceof Failure && error.status === 401) window.location.assign("/problem?c=" + error.code);
    }
  }, []);

  // The code panel survives a page reload for the same transaction. The code itself is never stored here.
  useEffect(() => {
    const saved: Record<string, Ui> = {};
    for (const d of initial.departments) {
      try {
        const raw = sessionStorage.getItem(key(initial.transaction_reference, d.provider_id));
        if (raw) saved[d.provider_id] = { challenge: JSON.parse(raw) as Challenge };
      } catch {
        /* storage may be unavailable */
      }
    }
    setUi(saved);
  }, [initial]);

  const retrieving = overview.departments.some((d) => d.status === "RETRIEVING");
  const waiting = overview.departments.some((d) => d.status === "OTP_SENT");
  useEffect(() => {
    if (!retrieving) return;
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [retrieving, refresh]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function guard(provider: string, work: () => Promise<void>) {
    patch(provider, { busy: true, error: undefined });
    setNotice("");
    try {
      await work();
    } catch (error) {
      const failure = error instanceof Failure ? error : new Failure(0, "NETWORK", "The connection was lost. Please try again.");
      if (failure.status === 401) window.location.assign("/problem?c=" + failure.code);
      if (failure.code === "ALREADY_AUTHORIZED" || failure.code === "RETRIEVAL_IN_PROGRESS") await refresh();
      else patch(provider, { error: failure.message });
    } finally {
      patch(provider, { busy: false });
    }
  }

  const sendCode = (provider: string) =>
    guard(provider, async () => {
      const challenge = await api<Challenge>(`departments/${provider}/otp`, "POST");
      const { demo_code: _demo, ...storable } = challenge;
      void _demo;
      try {
        sessionStorage.setItem(key(tx, provider), JSON.stringify(storable));
      } catch {
        /* ignore */
      }
      patch(provider, { challenge, code: "" });
      setNow(Date.now());
      await refresh();
    });

  const fetchRecords = (provider: string) =>
    guard(provider, async () => {
      await api<Card>(`departments/${provider}/verify`, "POST");
      await refresh();
    });

  const submitCode = (provider: string) =>
    guard(provider, async () => {
      const state = ui[provider];
      if (!state?.challenge || !/^[0-9]{6}$/.test(state.code ?? "")) throw new Failure(400, "INVALID_REQUEST", "Enter the six-digit code from your SMS.");
      try {
        await api(`departments/${provider}/otp/verify`, "POST", { challenge_reference: state.challenge.challenge_reference, code: state.code });
      } catch (error) {
        if (error instanceof Failure && (error.code === "OTP_ATTEMPTS_EXHAUSTED" || error.code === "OTP_EXPIRED")) patch(provider, { code: "" });
        throw error;
      }
      patch(provider, { code: "", challenge: undefined });
      try {
        sessionStorage.removeItem(key(tx, provider));
      } catch {
        /* ignore */
      }
      await api<Card>(`departments/${provider}/verify`, "POST");
      await refresh();
    });

  const decline = (provider: string) =>
    guard(provider, async () => {
      await api<Card>(`departments/${provider}/decline`, "POST");
      patch(provider, { challenge: undefined, code: "" });
      try {
        sessionStorage.removeItem(key(tx, provider));
      } catch {
        /* ignore */
      }
      await refresh();
    });

  async function finish() {
    const unverified = overview.departments.filter((d) => d.status !== "COMPLETED");
    if (unverified.length && !confirming) {
      setConfirming(true);
      return;
    }
    setFinishing(true);
    setNotice("");
    try {
      await api("complete", "POST");
      window.location.assign("/result");
    } catch (error) {
      setFinishing(false);
      if (error instanceof Failure && error.status === 401) window.location.assign("/problem?c=" + error.code);
      setNotice(error instanceof Failure ? error.message : "The connection was lost. Please try again.");
    }
  }

  const done = overview.departments.filter((d) => d.status === "COMPLETED").length;
  const unverified = overview.departments.filter((d) => d.status !== "COMPLETED");

  return (
    <>
      <section className="intro">
        <p className="overline">Verify with MahaSetu</p>
        <h1>Verify your records for {overview.service_name}</h1>
        <p className="lead">
          {overview.service_name} needs the documents below from other departments. For each one, choose <strong>Verify</strong>,
          then enter the code we send to <strong>{overview.mobile_masked}</strong> to give permission.
        </p>
      </section>

      <p role="status" aria-live="polite" className={notice ? "notice error" : "sr"}>{notice}</p>

      <ul className="cards">
        {overview.departments.map((d) => {
          const s = ui[d.provider_id] ?? {};
          const wait = remaining(s.challenge?.resend_after, now);
          const busy = Boolean(s.busy);
          return (
            <li key={d.provider_id}>
              <article aria-labelledby={`h-${d.provider_id}`} className={`dept ${TONE[d.status]}`} data-provider={d.provider_id} data-status={d.status}>
                <div className="cardhead">
                  <h2 id={`h-${d.provider_id}`}>{d.display_name}</h2>
                  <span className={`pill ${TONE[d.status]}`}>{LABEL[d.status]}</span>
                </div>
                <ul className="docs">
                  {d.documents.map((doc) => (
                    <li key={doc.category}><strong>{doc.label}</strong><span>{doc.description}</span></li>
                  ))}
                </ul>
                {d.detail ? <p className="detail">{d.detail}</p> : null}

                {d.status === "OTP_SENT" ? (
                  <form onSubmit={(e) => { e.preventDefault(); void submitCode(d.provider_id); }} className="codeform">
                    <label htmlFor={`c-${d.provider_id}`}>Six-digit code</label>
                    <div className="row">
                      <input id={`c-${d.provider_id}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                        pattern="[0-9]{6}" value={s.code ?? ""} disabled={busy || !s.challenge}
                        onChange={(e) => patch(d.provider_id, { code: e.target.value.replace(/\D/g, "") })} />
                      <button type="submit" className="button" disabled={busy || !s.challenge || (s.code ?? "").length !== 6}>
                        {busy ? "Checking" : "Confirm"}
                      </button>
                    </div>
                    {s.challenge?.demo_code ? (
                      <p className="demo-code">
                        Demonstration code: <strong>{s.challenge.demo_code}</strong>. It is also in the{" "}
                        {inboxEnabled ? <a href={`/messages?tx=${tx}`} target="_blank" rel="noreferrer">SMS inbox</a> : "SMS inbox"}.
                      </p>
                    ) : null}
                    {!s.challenge ? <p className="hint">Send a new code to continue.</p> : null}
                    <div className="row links">
                      <button type="button" className="link" disabled={busy || wait > 0} onClick={() => void sendCode(d.provider_id)}>
                        {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
                      </button>
                      <button type="button" className="link" disabled={busy} onClick={() => void decline(d.provider_id)}>Cancel</button>
                    </div>
                  </form>
                ) : null}

                {d.status === "NOT_STARTED" || d.status === "DECLINED" ? (
                  <div className="row">
                    <button type="button" className="button" disabled={busy} onClick={() => void sendCode(d.provider_id)}>
                      {busy ? "Sending code" : d.status === "DECLINED" ? "Verify again" : "Verify"}
                    </button>
                    {d.status === "NOT_STARTED" ? (
                      <button type="button" className="link" disabled={busy} onClick={() => void decline(d.provider_id)}>Not now</button>
                    ) : null}
                  </div>
                ) : null}

                {d.status === "AUTHORIZED" || d.status === "UNAVAILABLE" ? (
                  <div className="row">
                    <button type="button" className="button" disabled={busy} onClick={() => void fetchRecords(d.provider_id)}>
                      {d.status === "UNAVAILABLE" ? "Try again" : "Fetch records"}
                    </button>
                    <button type="button" className="link" disabled={busy} onClick={() => void decline(d.provider_id)}>Withdraw permission</button>
                  </div>
                ) : null}

                {d.status === "RETRIEVING" ? (
                  <p className="working" role="status"><span className="spinner" aria-hidden="true" /> Fetching the records. This takes a moment.</p>
                ) : null}

                {d.status === "COMPLETED" ? (
                  <div className="row">
                    <button type="button" className="link" disabled={busy} onClick={() => void decline(d.provider_id)}>Withdraw permission</button>
                  </div>
                ) : null}

                <p role="alert" className={s.error ? "notice error" : "sr"}>{s.error ?? ""}</p>
              </article>
            </li>
          );
        })}
      </ul>

      <section className="finish" aria-labelledby="finish-h">
        <h2 id="finish-h">Finish</h2>
        <p>{done} of {overview.departments.length} departments have given records.</p>
        {confirming ? (
          <div className="confirm" role="group" aria-label="Confirm finishing">
            <p>
              {unverified.map((d) => d.display_name).join(", ")} {unverified.length === 1 ? "has" : "have"} not been verified. That counts
              as missing information, so the result may come back incomplete. You can still go back and verify.
            </p>
            <div className="row">
              <button type="button" className="button" disabled={finishing} onClick={() => void finish()}>{finishing ? "Finishing" : "Finish anyway"}</button>
              <button type="button" className="link" disabled={finishing} onClick={() => setConfirming(false)}>Go back</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="button" disabled={!overview.can_complete || finishing} onClick={() => void finish()}>
              {finishing ? "Finishing" : `Finish and return to ${overview.service_name}`}
            </button>
            {!overview.can_complete ? <span className="hint">Wait until the checks finish.</span> : null}
          </div>
        )}
      </section>
    </>
  );
}
