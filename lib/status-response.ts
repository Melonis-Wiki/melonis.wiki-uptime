import { getStatusSnapshot } from "@/lib/status";
import type { PublicStatus } from "@/lib/types";

type StatusLoader = () => Promise<PublicStatus>;

export async function buildStatusResponse(
  loadStatus: StatusLoader = () => getStatusSnapshot(),
): Promise<Response> {
  try {
    const status = await loadStatus();
    return Response.json(status, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[uptime] status snapshot unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Данные мониторинга временно недоступны" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "30" },
      },
    );
  }
}
