// Database availability controls readiness, not process liveness.
export async function GET() {
  return Response.json({ status: "ok" });
}
