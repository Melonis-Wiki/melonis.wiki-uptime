export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
