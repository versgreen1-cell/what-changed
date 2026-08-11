import { env } from "cloudflare:workers";
import { createMonitor, listMonitors, MonitorError } from "../../../lib/monitoring";

function errorResponse(error: unknown) {
  const status = error instanceof MonitorError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Неожиданная ошибка.";
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    return Response.json({ monitors: await listMonitors(env.DB) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { url?: string; frequencyMinutes?: number };
    const monitor = await createMonitor(env.DB, payload.url ?? "", Number(payload.frequencyMinutes ?? 1440));
    return Response.json({ monitor }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
