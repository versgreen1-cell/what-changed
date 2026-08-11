import { env } from "cloudflare:workers";
import { getSnapshot } from "../../../../lib/monitoring";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const snapshot = await getSnapshot(env.DB, id);
  if (!snapshot) return new Response("Not found", { status: 404 });

  return new Response(snapshot.html_snapshot, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src * data: blob:; script-src 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self';",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
