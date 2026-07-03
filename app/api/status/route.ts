import { buildStatusResponse } from "@/lib/status-response";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return buildStatusResponse();
}
