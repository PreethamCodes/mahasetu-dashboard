# mahasetu-dashboard

Applicant authorization website and role-protected operations and administration areas.

## Local foundation probe

Copy .env.example to .env for local settings. From this directory run `docker build -t mahasetu-dashboard-probe .` then `docker run --rm -e PORT=3004 -p 127.0.0.1:3004:3004 mahasetu-dashboard-probe`. GET /health.txt reports the static foundation marker. Business endpoints and pages belong to subsequent phases.

Public hosting is managed by the project owner. Build from this directory only. Configure per-environment HTTPS URLs and credentials on the host.
