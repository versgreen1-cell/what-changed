"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  { label: "Free", value: "$0", detail: "Unlimited projects" },
  { label: "Pro", value: "$29", detail: "per month" },
  { label: "Business", value: "$79", detail: "per month" },
];

const demoAfter = [
  { label: "Free", value: "$0", detail: "Up to 5 projects", changed: true },
  { label: "Pro", value: "$39", detail: "per month", changed: true },
  { label: "Business", value: "$79", detail: "per month" },
];

const rawDiff = [
  "@@ -118,11 +124,15 @@ <section data-plan=\"pricing\">",
  "- <span class=\"price\" data-session=\"a8f2\">$29</span>",
  "+ <span class=\"price\" data-session=\"c19b\">$39</span>",
  "  <div class=\"features\">",
  "+   <li data-test=\"project-cap\">Up to 5 projects</li>",
  "-   <meta content=\"2026-08-10T09:14:03Z\">",
  "+   <meta content=\"2026-08-11T09:15:12Z\">",
  "-   <img src=\"/campaign/summer-a.webp\">",
  "+   <img src=\"/campaign/summer-b.webp\">",
  "  </div>",
  "  <script>window.__SESSION__=\"fce92d1...\"</script>",
];

function relativeDate(value: string | null) {
  if (!value) return "ещё не проверялось";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "только что";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(new Date(value));
}

function frequencyLabel(minutes: number) {
  if (minutes === 60) return "каждый час";
  if (minutes === 360) return "каждые 6 часов";
  if (minutes === 10080) return "раз в неделю";
  return "раз в день";
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function WhatChangedApp() {
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
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить мониторы.");
      setMonitors(payload.monitors ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить мониторы.");
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

  const alertsCount = monitors.filter((monitor) => monitor.latestChange).length + 1;

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
      if (!response.ok) throw new Error(payload.error || "Не удалось добавить страницу.");
      setUrl("");
      await refresh();
      if (payload.monitor) setSelectedId(payload.monitor.id);
      setMessage("Страница добавлена. Первый снимок уже сохранён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить страницу.");
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    if (!selected) {
      setDemoPulse(true);
      setShowTechnical(false);
      window.setTimeout(() => setDemoPulse(false), 900);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/monitors/${selected.id}/check`, { method: "POST" });
      const payload = (await response.json()) as { changed?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Проверка не удалась.");
      await refresh();
      setMessage(payload.changed ? "Найдено важное изменение." : "Проверено: важных изменений нет.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Проверка не удалась.");
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
      if (!response.ok) throw new Error("Не удалось изменить статус.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected || !window.confirm(`Перестать отслеживать ${hostLabel(selected.url)}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/monitors/${selected.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось удалить монитор.");
      setSelectedId("demo");
      await refresh();
      setMessage("Монитор удалён вместе с его снимками.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить монитор.");
    } finally {
      setBusy(false);
    }
  }

  const change = selected?.latestChange;
  const hasActualChange = Boolean(change);
  const summary = change?.summary ?? (selected
    ? "Пока всё спокойно. Мы сообщим только о содержательном изменении."
    : "Цена Pro выросла с $29 до $39. В бесплатном плане появился лимит в 5 проектов.");

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="WhatChanged — на главную">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>WhatChanged</span>
        </a>
        <div className="topbar-meta">
          <span className="live-dot"><i /> мониторинг работает</span>
          <a className="small-action" href="#new-monitor">Добавить страницу <span aria-hidden="true">＋</span></a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">Страницы меняются. Шум — нет.</span>
          <h1>Узнавайте только<br />о том, что <em>важно.</em></h1>
          <p>
            WhatChanged следит за ценами, условиями и политиками — и вместо сорока строк кода присылает одну нормальную фразу.
          </p>
        </div>
        <div className="hero-numbers" aria-label="Сводка мониторинга">
          <div><strong>{String(monitors.length + 1).padStart(2, "0")}</strong><span>страниц<br />под наблюдением</span></div>
          <div><strong>{String(alertsCount).padStart(2, "0")}</strong><span>важных<br />изменений</span></div>
          <div><strong>0</strong><span>ложных<br />тревог сегодня</span></div>
        </div>
      </section>

      <section className="monitor-form-wrap" id="new-monitor">
        <form className="monitor-form" onSubmit={addMonitor}>
          <label className="url-field">
            <span>Адрес страницы</span>
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
          <label className="frequency-field">
            <span>Проверять</span>
            <select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))}>
              <option value={60}>Каждый час</option>
              <option value={360}>Каждые 6 часов</option>
              <option value={1440}>Раз в день</option>
              <option value={10080}>Раз в неделю</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Добавляем…" : "Следить за страницей"}<span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="form-note"><span aria-hidden="true">●</span> Первый снимок сохраняется сразу. Аккаунт и настройка не нужны.</p>
        {message && <p className="toast" role="status">{message}</p>}
      </section>

      <section className="workspace" aria-label="Мониторинг страниц">
        <aside className="monitor-list">
          <div className="section-heading">
            <span>Под наблюдением</span>
            <b>{monitors.length + 1}</b>
          </div>
          <button
            className={`monitor-item ${selectedId === "demo" ? "selected" : ""}`}
            type="button"
            onClick={() => { setSelectedId("demo"); setShowTechnical(false); }}
          >
            <span className="site-favicon demo-favicon">F</span>
            <span className="monitor-copy"><strong>Formly Pricing</strong><small>formly.example/pricing</small></span>
            <span className="alert-badge" aria-label="Есть изменение">1</span>
          </button>

          {loading ? (
            <div className="list-loading">Загружаем ваши страницы…</div>
          ) : monitors.map((monitor) => (
            <button
              className={`monitor-item ${selectedId === monitor.id ? "selected" : ""}`}
              type="button"
              key={monitor.id}
              onClick={() => { setSelectedId(monitor.id); setShowTechnical(false); }}
            >
              <span className="site-favicon">{hostLabel(monitor.url).charAt(0).toUpperCase()}</span>
              <span className="monitor-copy"><strong>{monitor.name}</strong><small>{hostLabel(monitor.url)}</small></span>
              {monitor.latestChange ? <span className="alert-badge" aria-label="Есть изменение">1</span> : <span className="quiet-badge" aria-label="Изменений нет">✓</span>}
            </button>
          ))}

          <div className="filter-note">
            <span className="filter-icon" aria-hidden="true">≋</span>
            <div><strong>Шум отфильтрован</strong><p>Время, реклама, cookie и служебные токены не создают тревогу.</p></div>
          </div>
        </aside>

        <article className={`change-panel ${demoPulse ? "pulse" : ""}`}>
          <div className="change-header">
            <div>
              <div className="breadcrumb">
                <span>{selected ? hostLabel(selected.url) : "formly.example"}</span>
                <span aria-hidden="true">/</span>
                <b>{selected?.name ?? "Pricing"}</b>
              </div>
              <h2>{selected?.name ?? "Formly — тарифы"}</h2>
            </div>
            <div className="change-actions">
              {selected && (
                <button className="icon-button" type="button" onClick={toggleStatus} disabled={busy} title={selected.status === "active" ? "Приостановить" : "Возобновить"}>
                  {selected.status === "active" ? "Ⅱ" : "▶"}
                </button>
              )}
              <button className="check-button" type="button" onClick={checkNow} disabled={busy}>
                <span aria-hidden="true">↻</span> {busy ? "Проверяем…" : selected ? "Проверить сейчас" : "Повторить демо"}
              </button>
            </div>
          </div>

          <div className="status-row">
            <span className={selected?.lastError ? "status-error" : "status-ok"}>
              <i /> {selected?.lastError ? "нужна проверка" : selected?.status === "paused" ? "на паузе" : "активно"}
            </span>
            <span>Проверка: {selected ? frequencyLabel(selected.frequencyMinutes) : "каждый час"}</span>
            <span>Последняя: {selected ? relativeDate(selected.lastCheckedAt) : "12 мин назад"}</span>
          </div>

          {selected?.lastError && <div className="error-strip">{selected.lastError}</div>}

          <section className={`signal-card ${hasActualChange || !selected ? "has-change" : "is-quiet"}`}>
            <div className="signal-label">
              <span>{hasActualChange || !selected ? "Важное изменение" : "Изменений нет"}</span>
              <time>{change ? relativeDate(change.createdAt) : selected ? relativeDate(selected.lastCheckedAt) : "сегодня, 09:15"}</time>
            </div>
            <p>{summary}</p>
            {(hasActualChange || !selected) && (
              <div className="signal-tags">
                <span>цена</span><span>условия тарифа</span><b>{change ? `${change.score}% текста` : "2 значимых правки"}</b>
              </div>
            )}
          </section>

          <div className="view-switch" role="tablist" aria-label="Режим сравнения">
            <button type="button" role="tab" aria-selected={!showTechnical} onClick={() => setShowTechnical(false)}>Понятное сравнение</button>
            <button type="button" role="tab" aria-selected={showTechnical} onClick={() => setShowTechnical(true)}>Технический diff <span>для контраста</span></button>
          </div>

          {showTechnical ? (
            <div className="technical-diff" role="tabpanel">
              <div className="code-top"><span /><span /><span /><b>page-source.diff</b><em>11 строк из 43</em></div>
              <pre>{rawDiff.map((line, index) => <code className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : ""} key={index}>{line}{"\n"}</code>)}</pre>
              <div className="noise-caption"><strong>9 из 11 строк — шум</strong><span>WhatChanged оставил только изменение цены и лимита.</span></div>
            </div>
          ) : (change ? (
            <div className="comparison actual-comparison" role="tabpanel">
              <SnapshotFrame label="Было" snapshotId={change.fromSnapshotId} />
              <SnapshotFrame label="Стало" snapshotId={change.toSnapshotId} changed />
            </div>
          ) : selected ? (
            <div className="current-snapshot" role="tabpanel">
              <div className="empty-orbit"><i /><i /><i /></div>
              <h3>Первый снимок сохранён</h3>
              <p>Следующая проверка сравнит страницу с этой версией. Если поменяются только часы, cookie или рекламный блок, мы промолчим.</p>
              {selected.latestSnapshot?.preview?.length ? (
                <div className="snapshot-lines">
                  {selected.latestSnapshot.preview.slice(0, 5).map((line, index) => <span key={index}>{line}</span>)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="comparison" role="tabpanel">
              <DemoSnapshot label="Было" date="10 авг, 09:14" plans={demoBefore} />
              <DemoSnapshot label="Стало" date="11 авг, 09:15" plans={demoAfter} changed />
            </div>
          ))}

          <footer className="panel-footer">
            <span>Следующая проверка: {selected?.status === "paused" ? "после возобновления" : selected?.nextCheckAt ? relativeDate(selected.nextCheckAt) : "через 48 минут"}</span>
            {selected ? <button type="button" onClick={removeSelected} disabled={busy}>Удалить монитор</button> : <span className="demo-label">Демонстрационный монитор</span>}
          </footer>
        </article>
      </section>

      <footer className="site-footer">
        <p><strong>WhatChanged</strong> — смысл изменений без шума разметки.</p>
        <span>Society &amp; Sustainability · 2026</span>
      </footer>
    </main>
  );
}

function DemoSnapshot({
  label,
  date,
  plans,
  changed = false,
}: {
  label: string;
  date: string;
  plans: { label: string; value: string; detail: string; changed?: boolean }[];
  changed?: boolean;
}) {
  return (
    <section className="snapshot">
      <div className="snapshot-heading"><span>{label}</span><time>{date}</time></div>
      <div className="browser-frame">
        <div className="browser-bar"><i /><i /><i /><span>formly.example/pricing</span></div>
        <div className="mock-page">
          <div className="mock-nav"><b>formly</b><span>Product&nbsp;&nbsp;&nbsp;Solutions&nbsp;&nbsp;&nbsp;Pricing</span><em>Start free</em></div>
          <h3>Simple pricing</h3>
          <p>Everything you need to collect better data.</p>
          <div className="plans">
            {plans.map((plan) => (
              <div className={`plan ${plan.changed ? "changed" : ""}`} key={plan.label}>
                <small>{plan.label}</small><strong>{plan.value}</strong><span>{plan.detail}</span><i />
              </div>
            ))}
          </div>
          {changed && <div className="change-callout"><span>2 изменения</span></div>}
        </div>
      </div>
    </section>
  );
}

function SnapshotFrame({ label, snapshotId, changed = false }: { label: string; snapshotId: number; changed?: boolean }) {
  return (
    <section className="snapshot">
      <div className="snapshot-heading"><span>{label}</span><time>сохранённый снимок</time></div>
      <div className={`browser-frame live-frame ${changed ? "changed-frame" : ""}`}>
        <div className="browser-bar"><i /><i /><i /><span>снимок страницы</span></div>
        <iframe src={`/api/snapshots/${snapshotId}`} title={`${label}: сохранённая версия страницы`} sandbox="" />
        {changed && <div className="detected-box"><span>изменённая область</span></div>}
      </div>
    </section>
  );
}
