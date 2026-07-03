import { StatusDashboard } from "@/components/StatusDashboard";
import { getStatusSnapshot } from "@/lib/status";
import type { PublicStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialStatus: PublicStatus | null = null;
  try {
    initialStatus = await getStatusSnapshot();
  } catch {
    // The dashboard renders an explicit unavailable state and retries client-side.
  }

  return <StatusDashboard initialStatus={initialStatus} />;
}
