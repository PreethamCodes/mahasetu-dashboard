import type { Metadata } from "next";
import Link from "next/link";
import { config } from "../lib/config";
import "./site.css";

export const metadata: Metadata = {
  title: "MahaSetu | Verify with MahaSetu",
  description: "Share verified records from government departments with the service you are applying to.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header>
          <div className="frame mast">
            <Link href="/" className="brand">
              <span className="seal" aria-hidden="true">M</span>
              <span>
                <strong>MahaSetu</strong>
                <small>Government service interoperability</small>
              </span>
            </Link>
            <nav aria-label="Site">
              {config().inboxEnabled ? <Link href="/messages">SMS inbox</Link> : null}
              <span className="demo">Demonstration &middot; synthetic data</span>
            </nav>
          </div>
        </header>
        <main id="main" className="frame">{children}</main>
        <footer className="frame">
          MahaSetu shares only the records a service needs, and only after you give permission with a code sent to your mobile.
        </footer>
      </body>
    </html>
  );
}
