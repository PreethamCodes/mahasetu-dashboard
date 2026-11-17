export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ site: "mahasetu-dashboard", status: "ready" });
}
