"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  PublicServiceStatus,
  PublicStatus,
  ServiceState,
} from "@/lib/types";

const STATE_COPY: Record<
  ServiceState,
  { label: string; overall: string; className: string }
> = {
  up: {
    label: "Работает",
    overall: "Все системы работают",
    className: "state-up",
  },
  degraded: {
    label: "Нестабильно",
    overall: "Некоторые системы нестабильны",
    className: "state-degraded",
  },
  down: {
    label: "Недоступно",
    overall: "Обнаружена недоступность",
    className: "state-down",
  },
  unknown: {
    label: "Нет данных",
    overall: "Ожидание данных мониторинга",
    className: "state-unknown",
  },
};

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

function ServiceRow({ service }: { service: PublicServiceStatus }) {
  const copy = STATE_COPY[service.state];
  return (
    <article className="service-row">
      <div className="service-summary">
        <div className="service-heading">
          <span className={`status-pill ${copy.className}`}>
            {formatPercent(service.uptimePercent)}
          </span>
          <h2>{service.name}</h2>
        </div>
        <div className="service-meta">
          <span className={`state-label ${copy.className}`}>
            <span className="state-dot" aria-hidden="true" />
            {copy.label}
          </span>
        </div>
      </div>

      <div className="timeline-wrap">
        <div className="timeline" aria-label={`История состояния: ${service.name}`}>
          {service.buckets.map((bucket, index) => {
            const bucketCopy = STATE_COPY[bucket.state];
            return (
              <span
                // The API always returns stable chronological half-hour buckets.
                key={`${bucket.from}-${index}`}
                className={`timeline-segment ${bucketCopy.className}`}
                title={`${new Intl.DateTimeFormat("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(bucket.from))} — ${bucketCopy.label}`}
                aria-label={bucketCopy.label}
              />
            );
          })}
        </div>
        <div className="timeline-labels" aria-hidden="true">
          <span>24 ч назад</span>
          <span>Сейчас</span>
        </div>
      </div>
    </article>
  );
}

export function StatusDashboard({
  initialStatus,
}: {
  initialStatus: PublicStatus | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [unavailable, setUnavailable] = useState(initialStatus === null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status_unavailable");
      const nextStatus = (await response.json()) as PublicStatus;
      setStatus(nextStatus);
      setUnavailable(false);
    } catch {
      setStatus(null);
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    const initialRetry = !initialStatus
      ? window.setTimeout(() => void refresh(), 0)
      : undefined;
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      if (initialRetry !== undefined) window.clearTimeout(initialRetry);
      window.clearInterval(interval);
    };
  }, [initialStatus, refresh]);

  const overall = STATE_COPY[status?.overall ?? "unknown"];

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">melonis.wiki</p>
          <h1>Состояние сервисов</h1>
        </div>
        <a href="https://melonis.wiki" className="wiki-link">
          Открыть вики
          <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={`overall-card ${overall.className}`} aria-live="polite">
        <span className="overall-icon" aria-hidden="true">
          {status?.overall === "up" ? "✓" : status?.overall === "down" ? "!" : "•"}
        </span>
        <div>
          <strong>{unavailable ? "Мониторинг временно недоступен" : overall.overall}</strong>
          <p>
            {unavailable
              ? "Не удалось получить сохранённые данные. Следующая попытка будет выполнена автоматически."
              : `Данные обновлены ${new Intl.DateTimeFormat("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date(status!.generatedAt))}`}
          </p>
        </div>
      </section>

      {status ? (
        <section className="services-card" aria-label="Состояние компонентов">
          {status.services.map((service) => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </section>
      ) : (
        <section className="services-card empty-state">
          <p>История проверок сейчас недоступна.</p>
          <button type="button" onClick={() => void refresh()}>
            Повторить
          </button>
        </section>
      )}

    </main>
  );
}
