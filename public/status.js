const stateCopy = {
  up: { label: "Работает", overall: "Все системы работают" },
  degraded: { label: "Нестабильно", overall: "Некоторые системы нестабильны" },
  down: { label: "Недоступно", overall: "Обнаружена недоступность" },
  unknown: { label: "Нет данных", overall: "Ожидание данных мониторинга" },
};

const percentFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});
const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});
const updateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const overallElement = document.querySelector("#overall");
const servicesElement = document.querySelector("#services");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatPercent(value) {
  return value === null ? "—" : `${percentFormatter.format(value)}%`;
}

function renderUnavailable() {
  overallElement.className = "overall-card state-unknown";
  const summary = element("div");
  summary.append(
    element("strong", "", "Мониторинг временно недоступен"),
    element(
      "p",
      "",
      "Не удалось получить сохранённые данные. Следующая попытка будет выполнена автоматически.",
    ),
  );
  overallElement.replaceChildren(
    element("span", "overall-icon", "•"),
    summary,
  );

  const retry = element("button", "", "Повторить");
  retry.type = "button";
  retry.addEventListener("click", refresh);
  servicesElement.className = "services-card empty-state";
  servicesElement.replaceChildren(
    element("p", "", "История проверок сейчас недоступна."),
    retry,
  );
}

function renderStatus(status) {
  const overall = stateCopy[status.overall] ?? stateCopy.unknown;
  const state = stateCopy[status.overall] ? status.overall : "unknown";
  overallElement.className = `overall-card state-${state}`;
  const icon = element("span", "overall-icon", state === "up" ? "✓" : state === "down" ? "!" : "•");
  icon.setAttribute("aria-hidden", "true");
  const summary = element("div");
  summary.append(
    element("strong", "", overall.overall),
    element("p", "", `Данные обновлены ${updateTimeFormatter.format(new Date(status.generatedAt))}`),
  );
  overallElement.replaceChildren(icon, summary);

  servicesElement.className = "services-card";
  servicesElement.setAttribute("aria-label", "Состояние компонентов");
  servicesElement.replaceChildren(...status.services.map(renderService));
}

function renderService(service) {
  const copy = stateCopy[service.state] ?? stateCopy.unknown;
  const state = stateCopy[service.state] ? service.state : "unknown";
  const row = element("article", "service-row");
  const summary = element("div", "service-summary");
  const heading = element("div", "service-heading");
  heading.append(
    element("span", `status-pill state-${state}`, formatPercent(service.uptimePercent)),
    element("h2", "", service.name),
  );
  const meta = element("div", "service-meta");
  const label = element("span", `state-label state-${state}`);
  const dot = element("span", "state-dot");
  dot.setAttribute("aria-hidden", "true");
  label.append(dot, document.createTextNode(copy.label));
  meta.append(label);
  summary.append(heading, meta);

  const timelineWrap = element("div", "timeline-wrap");
  const timeline = element("div", "timeline");
  timeline.setAttribute("aria-label", `История состояния: ${service.name}`);
  for (const bucket of service.buckets) {
    const bucketState = stateCopy[bucket.state] ? bucket.state : "unknown";
    const segment = element("span", `timeline-segment state-${bucketState}`);
    const title = `${timeFormatter.format(new Date(bucket.from))} — ${stateCopy[bucketState].label}`;
    segment.title = title;
    segment.setAttribute("aria-label", stateCopy[bucketState].label);
    timeline.append(segment);
  }
  const labels = element("div", "timeline-labels");
  labels.setAttribute("aria-hidden", "true");
  labels.append(element("span", "", "24 ч назад"), element("span", "", "Сейчас"));
  timelineWrap.append(timeline, labels);
  row.append(summary, timelineWrap);
  return row;
}

async function refresh() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error("status_unavailable");
    renderStatus(await response.json());
  } catch {
    renderUnavailable();
  }
}

void refresh();
window.setInterval(() => void refresh(), 60_000);
