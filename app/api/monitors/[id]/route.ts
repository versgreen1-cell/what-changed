import { env } from "cloudflare:workers";
import { deleteMonitor, MonitorError, updateMonitor } from "../../../../lib/monitoring";

function parseId(value: string) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw new MonitorError("Invalid monitor ID.");
  return id;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as {
      status?: "active" | "paused";
      frequencyMinutes?: number;
    };
    await updateMonitor(env.DB, parseId(id), payload);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof MonitorError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteMonitor(env.DB, parseId(id));
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof MonitorError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status });
  }
}
