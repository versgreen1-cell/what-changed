import { env } from "cloudflare:workers";
import { checkMonitor, MonitorError } from "../../../../../lib/monitoring";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number.parseInt(rawId, 10);
    if (!Number.isInteger(id) || id <= 0) throw new MonitorError("Invalid monitor ID.");
    return Response.json(await checkMonitor(env.DB, id));
  } catch (error) {
    const status = error instanceof MonitorError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status });
  }
}
