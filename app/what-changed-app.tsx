"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Change = {
  id: number;
  summary: string;
  added: string[];
  removed: string[];
  score: number;
  fromSnapshotId: number;
  toSnapshotId: number;
  createdAt: string;
};

type Monitor = {
  id: number;
  url: string;
  name: string;
  frequencyMinutes: number;
  status: "active" | "paused";
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  createdAt: string;
  latestSnapshot: {
    id: number;
    preview: string[];
    capturedAt: string | null;
  } | null;
  latestChange: Change | null;
};

const demoBefore = [
  { label: "Latest", value: "19.2.7", detail: "June 1, 2026" },
  { label: "React 19.1", value: "19.1.8", detail: "June 1, 2026" },
  { label: "React 19.0", value: "19.0.7", detail: "June 1, 2026" },
];

const demoAfter = [
  { label: "Latest", value: "19.2.8", detail: "July 21, 2026", changed: true },
  { label: "React 19.1", value: "19.1.9", detail: "July 21, 2026", changed: true },
  { label: "React 19.0", value: "19.0.8", detail: "July 21, 2026", changed: true },
];

const rawDiff = [
  '@@ -352,8 +352,12 @@ <section aria-label="Release list">',
  '- <a href="/react/react/releases/tag/v19.2.7">19.2.7</a>',
  '+ <a href="/react/react/releases/tag/v19.2.8">19.2.8</a>',
  '+ <time datetime="2026-07-21">July 21st, 2026</time>',
  '+ <h3>React Server Components</h3>',
  '+ <li>Performance improvements when decoding</li>',
  '- <meta data-turbo-transient content="d8b4a1">',
  '+ <meta data-turbo-transient content="f49c32">',
  '- <script nonce="27af">window.__HYDRATION__=...</script>',
  '+ <script nonce="91cc">window.__HYDRATION__=...</script>',
];

function relativeDate(value: string | null) {
  if (!value) return "not checked yet";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(value));
}

function frequencyLabel(minutes: number) {
  if (minutes === 60) return "Hourly";
  if (minutes === 360) return "Every 6 hours";
  if (minutes === 10080) return "Weekly";
  return "Daily";
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type AppView = "watches" | "history";

export function WhatChangedApp({ view = "watches" }: { view?: AppView }) {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [selectedId, setSelectedId] = useState<number | "demo">("demo");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [frequency, setFrequency] = useState(1440);
  const [message, setMessage] = useState<string | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [demoPulse, setDemoPulse] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/monitors", { cache: "no-store" });
      const payload = (await response.json()) as { monitors?: Monitor[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load your pages.");
      setMonitors(payload.monitors ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load your pages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const selected = useMemo(
    () => (selectedId === "demo" ? null : monitors.find((monitor) => monitor.id === selectedId) ?? null),
    [monitors, selectedId],
  );

  async function addMonitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, frequencyMinutes: frequency }),
      });
      const payload = (await response.json()) as { monitor?: { id: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not add this page.");
      setUrl("");
      await refresh();
      if (payload.monitor) setSelectedId(payload.monitor.id);
      setMessage("Page added. The first snapshot is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this page.");
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    if (!selected) {
      setDemoPulse(true);
      setShowTechnical(false);
      window.setTimeout(() => setDemoPulse(false), 700);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monitors/${selected.id}/check`, { method: "POST" });
      const payload = (await response.json()) as { changed?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "The check failed.");
      await refresh();
      setMessage(payload.changed ? "A meaningful change was found." : "Checked. Nothing important changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monitors/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selected.status === "active" ? "paused" : "active" }),
      });
      if (!response.ok) throw new Error("Could not update the monitor.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the monitor.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected || !window.confirm(`Stop watching ${hostLabel(selected.url)}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monitors/${selected.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove the monitor.");
      setSelectedId("demo");
      await refresh();
      setMessage("Monitor removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove the monitor.");
    } finally {
      setBusy(false);
    }
  }

  function openMonitor(id: number | "demo") {
    setSelectedId(id);
    setShowTechnical(false);
    if (view === "watches") {
      window.sessionStorage.setItem("whatchanged:selected", String(id));
      window.location.assign("/history");
    }
  }

  useEffect(() => {
    if (view !== "history") return;
    const saved = window.sessionStorage.getItem("whatchanged:selected");
    if (!saved) return;
    const timer = window.setTimeout(
      () => setSelectedId(saved === "demo" ? "demo" : Number(saved)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [view]);

  const change = selected?.latestChange;
  const hasChange = Boolean(change) || !selected;
  const summary = change?.summary ?? (selected
    ? "Nothing important has changed. We will keep checking."
    : "React 19.2.8 was published. The notes mention a React Server Components decoding improvement.");

  return (
    <main className={`page view-${view}`}>
      <header className="cdio-header">
        <Link className="cdio-brand" href="/" aria-label="What changed home">
          <span aria-hidden="true">W/</span>
          What changed
        </Link>
        <nav aria-label="Application">
          <Link className={view === "watches" ? "active" : ""} href="/">Watches</Link>
          <Link className={view === "history" ? "active" : ""} href="/history">History</Link>
          <button type="button">Settings</button>
        </nav>
        <span className="cdio-state"><i /> local service</span>
      </header>

      {view === "watches" ? <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="product-name">Add watch</p>
          <h1 id="page-title">Web page URL</h1>
          <p>Enter one page to save its current version and check it on a schedule.</p>
        </div>

        <form className="add-form" onSubmit={addMonitor}>
          <label className="url-field">
            <span>Page address</span>
            <input
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com/pricing"
              autoComplete="url"
              required
            />
          </label>
          <label>
            <span>Check</span>
            <select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))}>
              <option value={60}>Hourly</option>
              <option value={360}>Every 6 hours</option>
              <option value={1440}>Daily</option>
              <option value={10080}>Weekly</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Adding..." : "Watch page"}
          </button>
        </form>
        <p className="form-note">The first snapshot is saved immediately. Dynamic page noise is ignored.</p>
        {message && <p className="notice" role="status">{message}</p>}
      </section> : null}

      <section className="app-grid" id="watches" aria-label="Page monitors">
        <aside className="monitor-list">
          <div className="list-title">
            <div>
              <button className="watch-filter active" type="button">All</button>
              <button className="watch-filter" type="button">Unread <b>1</b></button>
              <button className="watch-filter" type="button">Errors</button>
            </div>
            <span>{monitors.length + 1} watches</span>
          </div>
          <div className="monitor-columns" aria-hidden="true">
            <span>Web page</span><span>Last checked</span><span>Changes</span>
          </div>
          <button
            className={`monitor-item ${selectedId === "demo" ? "selected" : ""}`}
            type="button"
            onClick={() => openMonitor("demo")}
          >
            <span className="site-initial">R</span>
            <span className="monitor-copy"><strong>React releases</strong><small>github.com/react/react/releases</small></span>
            <span className="monitor-time">12 minutes ago</span>
            <span className="change-count" aria-label="One change">1</span>
          </button>

          {loading ? (
            <p className="list-loading">Loading pages...</p>
          ) : monitors.map((monitor) => (
            <button
              className={`monitor-item ${selectedId === monitor.id ? "selected" : ""}`}
              type="button"
              key={monitor.id}
              onClick={() => openMonitor(monitor.id)}
            >
              <span className="site-initial">{hostLabel(monitor.url).charAt(0).toUpperCase()}</span>
              <span className="monitor-copy"><strong>{monitor.name}</strong><small>{hostLabel(monitor.url)}</small></span>
              <span className="monitor-time">{relativeDate(monitor.lastCheckedAt)}</span>
              <span className={monitor.latestChange ? "change-count" : "quiet-mark"}>
                {monitor.latestChange ? "1" : "OK"}
              </span>
            </button>
          ))}
          <p className="noise-note">Showing all watches · click a row to inspect the latest saved change.</p>
        </aside>

        {view === "history" ? <article className={`change-panel ${demoPulse ? "pulse" : ""}`} id="change-detail">
          <div className="change-header">
            <div>
              <p>{selected ? hostLabel(selected.url) : "github.com/react/react/releases"}</p>
              <h2>{selected?.name ?? "React releases"}</h2>
            </div>
            <div className="change-actions">
              {selected && (
                <button className="secondary-button" type="button" onClick={toggleStatus} disabled={busy}>
                  {selected.status === "active" ? "Pause" : "Resume"}
                </button>
              )}
              <button className="secondary-button" type="button" onClick={checkNow} disabled={busy}>
                {busy ? "Checking..." : "Check now"}
              </button>
            </div>
          </div>

          <div className="status-row">
            <span className={selected?.lastError ? "status-error" : "status-ok"}>
              {selected?.lastError ? "Needs attention" : selected?.status === "paused" ? "Paused" : "Active"}
            </span>
            <span>{selected ? frequencyLabel(selected.frequencyMinutes) : "Hourly"}</span>
            <span>Last checked {selected ? relativeDate(selected.lastCheckedAt) : "12m ago"}</span>
          </div>

          {selected?.lastError && <div className="error-strip">{selected.lastError}</div>}

          <section className={`signal-card ${hasChange ? "has-change" : "is-quiet"}`}>
            <div className="signal-label">
              <span>{hasChange ? "Meaningful change" : "No change"}</span>
              <time>{change ? relativeDate(change.createdAt) : selected ? relativeDate(selected.lastCheckedAt) : "Today, 9:15"}</time>
            </div>
            <p>{summary}</p>
          </section>

          <div className="view-switch" role="tablist" aria-label="Comparison view">
            <button type="button" role="tab" aria-selected={!showTechnical} onClick={() => setShowTechnical(false)}>Before and after</button>
            <button type="button" role="tab" aria-selected={showTechnical} onClick={() => setShowTechnical(true)}>Raw diff</button>
          </div>

          {showTechnical ? (
            <div className="technical-diff" role="tabpanel">
              <div className="code-top">page-source.diff <span>11 lines</span></div>
              <pre>{rawDiff.map((line, index) => <code className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : ""} key={index}>{line}{"\n"}</code>)}</pre>
              <p>Most of this is page noise. What changed kept the release number and the relevant note.</p>
            </div>
          ) : change ? (
            <div className="comparison" role="tabpanel">
              <SnapshotFrame label="Before" snapshotId={change.fromSnapshotId} />
              <SnapshotFrame label="After" snapshotId={change.toSnapshotId} changed />
            </div>
          ) : selected ? (
            <div className="current-snapshot" role="tabpanel">
              <h3>First snapshot saved</h3>
              <p>The next check will compare the page against this version.</p>
              {selected.latestSnapshot?.preview?.length ? (
                <div className="snapshot-lines">
                  {selected.latestSnapshot.preview.slice(0, 5).map((line, index) => <span key={index}>{line}</span>)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="comparison" role="tabpanel">
              <DemoSnapshot label="Before" date="Aug 10, 9:14" plans={demoBefore} />
              <DemoSnapshot label="After" date="Aug 11, 9:15" plans={demoAfter} changed />
            </div>
          )}

          <div className="panel-footer">
            <span>Next check: {selected?.status === "paused" ? "after you resume" : selected?.nextCheckAt ? relativeDate(selected.nextCheckAt) : "in 48 minutes"}</span>
            {selected ? <button type="button" onClick={removeSelected} disabled={busy}>Remove page</button> : <span>Example monitor</span>}
          </div>
        </article> : null}
      </section>
    </main>
  );
}

function DemoSnapshot({ label, date, plans, changed = false }: {
  label: string;
  date: string;
  plans: { label: string; value: string; detail: string; changed?: boolean }[];
  changed?: boolean;
}) {
  return (
    <section className="snapshot">
      <div className="snapshot-heading"><strong>{label}</strong><time>{date}</time></div>
      <div className="snapshot-table">
        <div className="snapshot-table-head"><span>Channel</span><span>Version</span><span>Published</span></div>
        {plans.map((plan) => (
          <div className={`snapshot-table-row ${plan.changed ? "changed" : ""}`} key={plan.label}>
            <strong>{plan.label}</strong>
            <span>{plan.value}</span>
            <small>{plan.detail}</small>
          </div>
        ))}
        {changed ? <div className="snapshot-table-note">2 values changed since the previous check</div> : null}
      </div>
    </section>
  );
}

function SnapshotFrame({ label, snapshotId, changed = false }: { label: string; snapshotId: number; changed?: boolean }) {
  return (
    <section className="snapshot">
      <div className="snapshot-heading"><strong>{label}</strong><span>Saved page</span></div>
      <div className={`browser-frame live-frame ${changed ? "changed-frame" : ""}`}>
        <div className="browser-bar"><span>Page snapshot</span></div>
        <iframe src={`/api/snapshots/${snapshotId}`} title={`${label}: saved page version`} sandbox="" />
        {changed && <div className="detected-box"><span>changed area</span></div>}
      </div>
    </section>
  );
}
