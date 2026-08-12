import { ensureSchema } from "./database";

const MAX_PAGE_BYTES = 750_000;
const MAX_SNAPSHOT_CHARS = 450_000;

type MonitorRow = {
  id: number;
  url: string;
  name: string;
  frequency_minutes: number;
  status: "active" | "paused";
  last_checked_at: string | null;
  next_check_at: string | null;
  last_error: string | null;
  created_at: string;
};

type SnapshotRow = {
  id: number;
  monitor_id: number;
  content_hash: string;
  visible_text: string;
  html_snapshot: string;
  captured_at: string;
};

type ChangeRow = {
  id: number;
  monitor_id: number;
  from_snapshot_id: number;
  to_snapshot_id: number;
  summary: string;
  added_json: string;
  removed_json: string;
  change_score: number;
  created_at: string;
};

export class MonitorError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return true;
  }

  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function normalizeUrl(input: string) {
  const raw = input.trim();
  if (!raw) throw new MonitorError("Enter a page address.");

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new MonitorError("Check the page address — it does not look valid.");
  }

  if (!['http:', 'https:'].includes(url.protocol) || isPrivateHost(url.hostname)) {
    throw new MonitorError("Only public HTTP and HTTPS pages can be monitored.");
  }
  url.hash = "";
  return url.toString();
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    raquo: "»",
    rdquo: "”",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const hex = code[1]?.toLowerCase() === "x";
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? " ";
  });
}

function cleanVisibleText(html: string) {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|canvas)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|header|footer|main|nav|h[1-6]|tr|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const seen = new Set<string>();
  return decodeEntities(withoutNoise)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 2)
    .filter((line) => !/^(cookie settings|accept all cookies|privacy preferences|skip to content)$/i.test(line))
    .filter((line) => !/^(last updated|updated at|server time|generated at)\s*[:—-]?\s*[\d:/.,\s-]+$/i.test(line))
    .filter((line) => !/^(session|csrf|utm_|tracking)[\w-]*\s*[:=]/i.test(line))
    .filter((line) => {
      const key = line.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .slice(0, MAX_SNAPSHOT_CHARS);
}

function extractTitle(html: string, url: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
  return title.slice(0, 120) || new URL(url).hostname.replace(/^www\./, "");
}

function protectSnapshotHtml(html: string, sourceUrl: string) {
  const safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
    .replace(/\s(on\w+)\s*=\s*(["']).*?\2/gi, "")
    .replace(/\s(on\w+)\s*=\s*[^\s>]+/gi, "");
  const base = `<base href="${sourceUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;
  return (/<head[\s>]/i.test(safe) ? safe.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${safe}`)
    .slice(0, MAX_SNAPSHOT_CHARS);
}

async function readLimitedBody(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_PAGE_BYTES) throw new MonitorError("This page is too large for quick monitoring.", 422);
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new MonitorError("This page is too large for quick monitoring.", 422);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchPage(urlString: string) {
  let current = new URL(normalizeUrl(urlString));
  let response: Response | null = null;

  for (let redirect = 0; redirect < 4; redirect += 1) {
    response = await fetch(current, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        "User-Agent": "WhatChanged Monitor/1.0 (+page change monitoring)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, current);
      normalizeUrl(next.toString());
      current = next;
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    throw new MonitorError(`The page returned a ${response?.status ?? "network"} error.`, 422);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("text/") && !contentType.includes("html")) {
    throw new MonitorError("There is no readable web page at this address.", 422);
  }

  const html = await readLimitedBody(response);
  const visibleText = cleanVisibleText(html);
  if (visibleText.length < 40) {
    throw new MonitorError("There is not enough visible text on this page.", 422);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(visibleText));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return {
    finalUrl: current.toString(),
    title: extractTitle(html, current.toString()),
    visibleText,
    htmlSnapshot: protectSnapshotHtml(html, current.toString()),
    hash,
  };
}

function significantLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 4)
    .filter((line) => !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line));
}

function compareText(before: string, after: string) {
  const beforeLines = significantLines(before);
  const afterLines = significantLines(after);
  const beforeSet = new Set(beforeLines.map((line) => line.toLocaleLowerCase()));
  const afterSet = new Set(afterLines.map((line) => line.toLocaleLowerCase()));
  const added = afterLines.filter((line) => !beforeSet.has(line.toLocaleLowerCase()));
  const removed = beforeLines.filter((line) => !afterSet.has(line.toLocaleLowerCase()));
  const denominator = Math.max(beforeSet.size, afterSet.size, 1);
  const score = Math.min(100, Math.round(((added.length + removed.length) / denominator) * 100));
  return { added: added.slice(0, 16), removed: removed.slice(0, 16), score };
}

function shorten(value: string, max = 130) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trim()}…`;
}

function buildSummary(added: string[], removed: string[]) {
  const currency = /(?:[$€£₽]\s?\d[\d.,]*|\d[\d.,]*\s?(?:USD|EUR|GBP|RUB|₽|€|£))/i;
  const removedPrice = removed.find((line) => currency.test(line));
  const addedPrice = added.find((line) => currency.test(line));
  if (removedPrice && addedPrice) {
    const oldValue = removedPrice.match(currency)?.[0];
    const newValue = addedPrice.match(currency)?.[0];
    if (oldValue && newValue && oldValue !== newValue) {
      return `The price changed from ${oldValue} to ${newValue}. ${shorten(addedPrice, 90)}`;
    }
  }

  if (added.length && removed.length) {
    return `A section was updated: "${shorten(removed[0], 82)}" was replaced with "${shorten(added[0], 82)}".`;
  }
  if (added.length) return `The page now includes: "${shorten(added[0])}".`;
  if (removed.length) return `The page no longer includes: "${shorten(removed[0])}".`;
  return "The page content changed significantly.";
}

function nextCheck(frequencyMinutes: number) {
  return new Date(Date.now() + frequencyMinutes * 60_000).toISOString();
}

function parseChange(row: ChangeRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    summary: row.summary,
    added: JSON.parse(row.added_json) as string[],
    removed: JSON.parse(row.removed_json) as string[],
    score: row.change_score,
    fromSnapshotId: row.from_snapshot_id,
    toSnapshotId: row.to_snapshot_id,
    createdAt: row.created_at,
  };
}

export async function listMonitors(db: D1Database) {
  await ensureSchema(db);
  const result = await db.prepare(`SELECT
      m.*,
      s.id AS snapshot_id,
      s.visible_text AS snapshot_text,
      s.captured_at AS snapshot_captured_at,
      c.id AS change_id,
      c.from_snapshot_id,
      c.to_snapshot_id,
      c.summary,
      c.added_json,
      c.removed_json,
      c.change_score,
      c.created_at AS change_created_at
    FROM monitors m
    LEFT JOIN snapshots s ON s.id = (
      SELECT id FROM snapshots WHERE monitor_id = m.id ORDER BY id DESC LIMIT 1
    )
    LEFT JOIN changes c ON c.id = (
      SELECT id FROM changes WHERE monitor_id = m.id ORDER BY id DESC LIMIT 1
    )
    ORDER BY m.created_at DESC`).all<MonitorRow & {
      snapshot_id: number | null;
      snapshot_text: string | null;
      snapshot_captured_at: string | null;
      change_id: number | null;
      from_snapshot_id: number | null;
      to_snapshot_id: number | null;
      summary: string | null;
      added_json: string | null;
      removed_json: string | null;
      change_score: number | null;
      change_created_at: string | null;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    url: row.url,
    name: row.name,
    frequencyMinutes: row.frequency_minutes,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    nextCheckAt: row.next_check_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    latestSnapshot: row.snapshot_id
      ? {
          id: row.snapshot_id,
          preview: (row.snapshot_text ?? "").split("\n").slice(0, 8),
          capturedAt: row.snapshot_captured_at,
        }
      : null,
    latestChange: row.change_id
      ? parseChange({
          id: row.change_id,
          monitor_id: row.id,
          from_snapshot_id: row.from_snapshot_id!,
          to_snapshot_id: row.to_snapshot_id!,
          summary: row.summary!,
          added_json: row.added_json ?? "[]",
          removed_json: row.removed_json ?? "[]",
          change_score: row.change_score ?? 0,
          created_at: row.change_created_at!,
        })
      : null,
  }));
}

export async function createMonitor(db: D1Database, inputUrl: string, frequencyMinutes: number) {
  await ensureSchema(db);
  const url = normalizeUrl(inputUrl);
  const allowedFrequencies = [60, 360, 1440, 10080];
  const frequency = allowedFrequencies.includes(frequencyMinutes) ? frequencyMinutes : 1440;
  const existing = await db.prepare("SELECT id FROM monitors WHERE url = ?").bind(url).first<{ id: number }>();
  if (existing) throw new MonitorError("This page is already being monitored.", 409);

  const capture = await fetchPage(url);
  const now = new Date().toISOString();
  const monitor = await db.prepare(`INSERT INTO monitors
      (url, name, frequency_minutes, status, last_checked_at, next_check_at, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
      RETURNING *`)
    .bind(capture.finalUrl, capture.title, frequency, now, nextCheck(frequency), now, now)
    .first<MonitorRow>();
  if (!monitor) throw new MonitorError("Could not save the monitor.", 500);

  await db.prepare(`INSERT INTO snapshots
      (monitor_id, content_hash, visible_text, html_snapshot, captured_at)
      VALUES (?, ?, ?, ?, ?)`)
    .bind(monitor.id, capture.hash, capture.visibleText, capture.htmlSnapshot, now)
    .run();
  return monitor;
}

export async function checkMonitor(db: D1Database, id: number) {
  await ensureSchema(db);
  const monitor = await db.prepare("SELECT * FROM monitors WHERE id = ?").bind(id).first<MonitorRow>();
  if (!monitor) throw new MonitorError("Monitor not found.", 404);

  const now = new Date().toISOString();
  try {
    const capture = await fetchPage(monitor.url);
    const previous = await db.prepare(
      "SELECT * FROM snapshots WHERE monitor_id = ? ORDER BY id DESC LIMIT 1",
    ).bind(id).first<SnapshotRow>();

    const current = await db.prepare(`INSERT INTO snapshots
        (monitor_id, content_hash, visible_text, html_snapshot, captured_at)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *`)
      .bind(id, capture.hash, capture.visibleText, capture.htmlSnapshot, now)
      .first<SnapshotRow>();
    if (!current) throw new MonitorError("Could not save the new snapshot.", 500);

    let change = null;
    if (previous && previous.content_hash !== capture.hash) {
      const diff = compareText(previous.visible_text, capture.visibleText);
      if (diff.score >= 2 && (diff.added.length > 0 || diff.removed.length > 0)) {
        change = await db.prepare(`INSERT INTO changes
            (monitor_id, from_snapshot_id, to_snapshot_id, summary, added_json, removed_json, change_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *`)
          .bind(
            id,
            previous.id,
            current.id,
            buildSummary(diff.added, diff.removed),
            JSON.stringify(diff.added),
            JSON.stringify(diff.removed),
            diff.score,
            now,
          )
          .first<ChangeRow>();
      }
    }

    await db.prepare(`UPDATE monitors SET
        url = ?, name = ?, last_checked_at = ?, next_check_at = ?, last_error = NULL, updated_at = ?
        WHERE id = ?`)
      .bind(capture.finalUrl, capture.title, now, nextCheck(monitor.frequency_minutes), now, id)
      .run();
    return { changed: Boolean(change), change: parseChange(change), snapshotId: current.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not check the page.";
    await db.prepare(`UPDATE monitors SET
        last_checked_at = ?, next_check_at = ?, last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(now, nextCheck(monitor.frequency_minutes), message.slice(0, 300), now, id)
      .run();
    throw error;
  }
}

export async function updateMonitor(
  db: D1Database,
  id: number,
  values: { status?: "active" | "paused"; frequencyMinutes?: number },
) {
  await ensureSchema(db);
  const monitor = await db.prepare("SELECT * FROM monitors WHERE id = ?").bind(id).first<MonitorRow>();
  if (!monitor) throw new MonitorError("Monitor not found.", 404);
  const status = values.status && ["active", "paused"].includes(values.status) ? values.status : monitor.status;
  const frequency = values.frequencyMinutes && [60, 360, 1440, 10080].includes(values.frequencyMinutes)
    ? values.frequencyMinutes
    : monitor.frequency_minutes;
  await db.prepare(`UPDATE monitors SET status = ?, frequency_minutes = ?, next_check_at = ?, updated_at = ? WHERE id = ?`)
    .bind(status, frequency, nextCheck(frequency), new Date().toISOString(), id)
    .run();
}

export async function deleteMonitor(db: D1Database, id: number) {
  await ensureSchema(db);
  await db.prepare("DELETE FROM monitors WHERE id = ?").bind(id).run();
}

export async function getSnapshot(db: D1Database, id: number) {
  await ensureSchema(db);
  return db.prepare(`SELECT s.*, m.url FROM snapshots s
      JOIN monitors m ON m.id = s.monitor_id WHERE s.id = ?`)
    .bind(id)
    .first<SnapshotRow & { url: string }>();
}

export async function runScheduledChecks(db: D1Database) {
  await ensureSchema(db);
  const due = await db.prepare(`SELECT id FROM monitors
      WHERE status = 'active' AND (next_check_at IS NULL OR next_check_at <= ?)
      ORDER BY next_check_at ASC LIMIT 20`)
    .bind(new Date().toISOString())
    .all<{ id: number }>();

  for (const monitor of due.results) {
    try {
      await checkMonitor(db, monitor.id);
    } catch {
      // The monitor stores its own error and next retry time.
    }
  }
}
