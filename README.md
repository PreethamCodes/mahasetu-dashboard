# mahasetu-dashboard

The MahaSetu applicant website. A student arrives from a requesting service (for example the scholarship portal), sees each department and the document it must supply, gives permission with a one-time code, and sees the result with reasons before returning to the service. A demonstration SMS inbox shows the codes and result messages. Staff, administration and officer areas are not built yet.

It is a Next.js 16 / React 19 site. Its server calls MahaSetu Core; the browser never receives a Core credential or an applicant session token.

## Pages

| Path | Purpose |
|---|---|
| `/start?ref=` | Launch link from the requesting service. Exchanges the reference for a session, stores it in an HttpOnly cookie and redirects to `/verify` so the reference leaves the address bar. |
| `/verify` | One card per department with its documents and status. **Verify** sends a code to the registered mobile, the code grants permission for that department only, and the records are then fetched and checked. Permission can be withdrawn; an unavailable department can be retried; **Finish** asks for confirmation if some departments are unverified. |
| `/result` | Outcome, the reasons for anything that needs attention, passed checks, a note about the SMS, and a button back to the requesting service. A reload shows the same result. |
| `/messages` | Demonstration SMS inbox (all messages, or one verification with `?tx=`). Refreshes itself. |
| `/problem` | Clear pages for expired or invalid links and sessions and for MahaSetu being unreachable. |
| `/health` | Liveness. |

## How it keeps data safe

The browser talks only to this site's own `/api/core/*` routes, which accept an allowlist of applicant operations, attach the cookie's session and validate Core's answers. State-changing calls need a custom header and a same-site origin. Responses carry `no-store`, `no-referrer`, frame denial and a restrictive content security policy. The one-time code is shown only when Core is configured for demonstration disclosure. The inbox has no sign-in and is switched off with `DEMO_MESSAGE_INBOX=disabled`; Core also withholds code bodies from it when `CORE_ENVIRONMENT=production`.

## Run

```sh
npm install
cp .env.example .env     # set CORE_API_URL and DASHBOARD_CLIENT_TOKEN (the value Core was given); never commit .env
npm run build && npm start     # http://localhost:3004
```

Use `COOKIE_SECURE=false` only for local HTTP. The site needs a running Core; open it from a requesting service, or create a launch link as the scholarship portal's server would (`POST /v1/verification-requests` on Core).

## Tests

Browser tests need a running Core with the three departments, `OTP_DEMO_DISCLOSURE=enabled`, and this site:

```sh
pip install -r tests/requirements-test.txt
playwright install chromium            # or set BROWSER_CHANNEL=msedge to use installed Edge
CORE_REQUESTER_TOKEN=<Scholarship requester token> CORE_URL=http://localhost:8000 DASHBOARD_URL=http://localhost:3004 pytest tests
```

The tests walk the five demo students through the real flow, check wrong and exhausted codes, withdrawal, early finish, bad links, the browser endpoint's refusals, security headers, and a 375 px layout.

Public hosting is managed by the project owner. Build from this directory only. Configure per-environment HTTPS URLs and credentials on the host.
