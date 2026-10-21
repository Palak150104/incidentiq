const $ = (id) => document.getElementById(id);

const logFileInput = $("logFile");
const searchInput = $("searchInput");
const severityFilter = $("severityFilter");
const fileStatus = $("fileStatus");
let logs = [];
let currentFilename = "";

const SAMPLE_LOGS = `2026-10-21 10:02:01 INFO api Request received
2026-10-21 10:02:02 ERROR database Connection pool exhausted
2026-10-21 10:02:03 ERROR api Database query timed out
2026-10-21 10:02:04 WARN api Response latency above threshold
2026-10-21 10:02:05 ERROR gateway Upstream request failed: 504
2026-10-21 10:02:06 INFO api Health check completed
2026-10-21 10:02:07 WARN database Connection retry initiated
2026-10-21 10:02:08 ERROR database Connection attempt failed
2026-10-21 10:06:20 INFO worker Scheduled job started
2026-10-21 10:06:21 WARN worker Queue depth above threshold
2026-10-21 10:06:25 ERROR worker Job processing failed: dependency timeout
2026-10-21 10:07:01 INFO api Request recovered`;

function parseLogLine(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // ISO date + time, severity, service, message
  let match = trimmed.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\s+([^\s]+)\s+(.+)$/i);
  if (match) {
    let severity = match[2].toUpperCase();
    if (severity === "WARNING") severity = "WARN";
    if (severity === "FATAL" || severity === "CRITICAL") severity = "ERROR";
    const timestamp = match[1].replace(" ", "T");
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return { timestamp, severity, service: match[3], message: match[4], raw: trimmed, lineNumber };
  }

  // Common alternate: [timestamp] LEVEL service: message
  match = trimmed.match(/^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\]\s+(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\s+([^: ]+):?\s+(.+)$/i);
  if (match) {
    let severity = match[2].toUpperCase();
    if (severity === "WARNING") severity = "WARN";
    if (severity === "FATAL" || severity === "CRITICAL") severity = "ERROR";
    const timestamp = match[1].replace(" ", "T");
    if (Number.isNaN(new Date(timestamp).getTime())) return null;
    return { timestamp, severity, service: match[3], message: match[4], raw: trimmed, lineNumber };
  }

  // Common web-server / unstructured fallback with a timestamp and severity.
  match = trimmed.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s+.*?\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\b\s+(.+)$/i);
  if (match) {
    let severity = match[2].toUpperCase();
    if (severity === "WARNING") severity = "WARN";
    if (severity === "FATAL" || severity === "CRITICAL") severity = "ERROR";
    const rest = match[3];
    const parts = rest.match(/^([^\s]+)\s+(.+)$/);
    return {
      timestamp: match[1].replace(" ", "T"),
      severity,
      service: parts ? parts[1].replace(/:$/, "") : "unknown",
      message: parts ? parts[2] : rest,
      raw: trimmed,
      lineNumber
    };
  }
  return null;
}

function parseLogs(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const parsed = [];
  const invalidLines = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const entry = parseLogLine(line, index + 1);
    if (entry) parsed.push(entry);
    else invalidLines.push(index + 1);
  });
  return { parsed, totalLines: lines.filter(line => line.trim()).length, invalidLines };
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function setStatus(message, type = "") {
  fileStatus.textContent = message;
  fileStatus.className = `file-status ${type}`.trim();
}

function loadText(text, filename = "pasted logs") {
  const result = parseLogs(text);
  if (result.parsed.length === 0) {
    logs = [];
    currentFilename = "";
    updateDashboard();
    setStatus(`No valid log entries found (${result.totalLines} non-empty lines checked). Expected a timestamp, severity, service, and message.`, "error");
    $("workspaceStatus").textContent = "Could not parse logs";
    return;
  }

  logs = result.parsed.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  currentFilename = filename;
  updateDashboard();

  const skipped = result.invalidLines.length;
  const suffix = skipped ? ` Skipped ${skipped} unrecognized line${skipped === 1 ? "" : "s"}.` : "";
  setStatus(`Loaded ${logs.length} events from ${filename}.${suffix}`, "success");
  $("workspaceStatus").textContent = "Investigation ready";
}

function updateDashboard() {
  $("totalEvents").textContent = logs.length;
  $("errorCount").textContent = logs.filter(log => log.severity === "ERROR").length;
  $("warningCount").textContent = logs.filter(log => log.severity === "WARN").length;
  $("serviceCount").textContent = new Set(logs.map(log => log.service)).size;
  renderLogs();
  renderTimeline();
  renderCorrelations();
  renderRootCause();
}

function getFilteredLogs() {
  const query = searchInput.value.trim().toLowerCase();
  const severity = severityFilter.value;
  return logs.filter(log => {
    const matchesSeverity = severity === "ALL" || log.severity === severity;
    const searchable = `${log.timestamp} ${log.severity} ${log.service} ${log.message}`.toLowerCase();
    return matchesSeverity && searchable.includes(query);
  });
}

function renderLogs() {
  const table = $("logTable");
  const filtered = getFilteredLogs();
  $("resultCount").textContent = `${filtered.length} event${filtered.length === 1 ? "" : "s"}`;
  table.replaceChildren();

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty";
    cell.textContent = logs.length ? "No events match your filters." : "Upload a log file to start investigating.";
    row.appendChild(cell);
    table.appendChild(row);
    return;
  }

  filtered.forEach(log => {
    const row = document.createElement("tr");
    const timeCell = document.createElement("td");
    timeCell.textContent = formatTimestamp(log.timestamp);
    const severityCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `severity severity-${log.severity}`;
    badge.textContent = log.severity;
    severityCell.appendChild(badge);
    const serviceCell = document.createElement("td");
    serviceCell.textContent = log.service;
    const messageCell = document.createElement("td");
    messageCell.textContent = log.message;
    row.append(timeCell, severityCell, serviceCell, messageCell);
    table.appendChild(row);
  });
}

function renderTimeline() {
  const container = $("timeline");
  container.replaceChildren();
  $("timelineCount").textContent = `${logs.length} event${logs.length === 1 ? "" : "s"}`;

  if (!logs.length) {
    container.innerHTML = '<p class="empty">Load logs to generate an incident timeline.</p>';
    return;
  }

  logs.forEach(log => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    const time = document.createElement("div");
    time.className = "timeline-time";
    time.textContent = formatTimestamp(log.timestamp);
    const marker = document.createElement("span");
    marker.className = `timeline-marker ${log.severity}`;
    const content = document.createElement("div");
    content.className = "timeline-content";
    const title = document.createElement("strong");
    title.textContent = `${log.severity} · ${log.service}`;
    const message = document.createElement("span");
    message.textContent = log.message;
    const detail = document.createElement("small");
    detail.textContent = `Source line ${log.lineNumber}`;
    content.append(title, message, detail);
    item.append(time, marker, content);
    container.appendChild(item);
  });
}

function correlateEvents() {
  const significant = logs
    .filter(log => log.severity === "ERROR" || log.severity === "WARN")
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const groups = [];
  const windowMs = 5 * 60 * 1000;
  let group = [];

  for (const log of significant) {
    if (!group.length) {
      group = [log];
      continue;
    }
    const firstTime = new Date(group[0].timestamp).getTime();
    const currentTime = new Date(log.timestamp).getTime();
    if (currentTime - firstTime <= windowMs) {
      group.push(log);
    } else {
      if (group.length >= 2) groups.push(group);
      group = [log];
    }
  }
  if (group.length >= 2) groups.push(group);

  // Merge adjacent groups when their overall windows overlap.
  return groups.map((events, index) => ({
    id: index + 1,
    events,
    start: events[0].timestamp,
    end: events[events.length - 1].timestamp,
    services: [...new Set(events.map(event => event.service))]
  }));
}

function renderCorrelations() {
  const results = $("correlationResults");
  const incidents = correlateEvents();
  $("correlationCount").textContent = `${incidents.length} incident${incidents.length === 1 ? "" : "s"}`;
  results.replaceChildren();

  if (!incidents.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = logs.length ? "No correlated incidents found. Try logs with errors close together in time." : "Load logs to discover related events.";
    results.appendChild(empty);
    return;
  }

  incidents.forEach(incident => {
    const card = document.createElement("article");
    card.className = "correlation-card";
    const title = document.createElement("h3");
    title.textContent = `Incident Group ${incident.id}`;
    const meta = document.createElement("div");
    meta.className = "card-meta";
    [
      `${incident.events.length} significant events`,
      `${incident.services.length} service${incident.services.length === 1 ? "" : "s"}`,
      `${formatTimestamp(incident.start)} → ${formatTimestamp(incident.end)}`
    ].forEach(text => {
      const pill = document.createElement("span");
      pill.className = "meta-pill";
      pill.textContent = text;
      meta.appendChild(pill);
    });
    const summary = document.createElement("p");
    summary.textContent = `Related warning/error events appeared within a five-minute window across: ${incident.services.join(", ")}.`;
    const evidenceTitle = document.createElement("span");
    evidenceTitle.className = "evidence-title";
    evidenceTitle.textContent = "Correlated evidence";
    const list = document.createElement("ul");
    list.className = "evidence-list";
    incident.events.forEach(event => {
      const item = document.createElement("li");
      item.textContent = `${formatTimestamp(event.timestamp)} · ${event.severity} · ${event.service} — ${event.message}`;
      list.appendChild(item);
    });
    card.append(title, meta, summary, evidenceTitle, list);
    results.appendChild(card);
  });
}

function renderRootCause() {
  const container = $("rootCause");
  container.replaceChildren();
  if (!logs.length) {
    container.innerHTML = '<p class="empty">Load logs to generate potential root-cause hypotheses.</p>';
    return;
  }

  const hypotheses = [];
  const has = (pattern) => logs.filter(log => pattern.test(`${log.service} ${log.message}`));
  const database = has(/database|sql|connection pool|connection refused|query timed out/i);
  const upstream = has(/gateway|upstream|504|502|dependency/i);
  const timeout = has(/timeout|timed out|latency|slow response/i);
  const resource = has(/out of memory|memory pressure|cpu|resource exhausted|queue depth/i);
  const retry = has(/retry|attempt failed|connection attempt/i);

  if (database.length >= 1) {
    hypotheses.push({
      title: "Possible database connectivity failure",
      summary: "Database-related events were observed. Check database availability, connection-pool limits, credentials, and network connectivity.",
      evidence: database
    });
  }
  if (upstream.length >= 1) {
    hypotheses.push({
      title: "Possible upstream service disruption",
      summary: "Gateway or upstream errors may indicate an unavailable or slow dependency. Inspect upstream health and request timeouts.",
      evidence: upstream
    });
  }
  if (timeout.length >= 1) {
    hypotheses.push({
      title: "Possible request latency or timeout issue",
      summary: "Timeout or latency events were observed. Investigate slow dependencies, resource saturation, and configured timeout thresholds.",
      evidence: timeout
    });
  }
  if (resource.length >= 1) {
    hypotheses.push({
      title: "Possible resource saturation",
      summary: "Resource or queue pressure was mentioned in the logs. Inspect CPU, memory, worker capacity, and queue backlogs.",
      evidence: resource
    });
  }
  if (retry.length >= 1) {
    hypotheses.push({
      title: "Repeated connection attempts",
      summary: "Retry or failed-attempt messages were detected. Check retry policy, backoff behavior, and the underlying dependency's health.",
      evidence: retry
    });
  }
  if (!hypotheses.length) {
    hypotheses.push({
      title: "No specific rule matched",
      summary: "The current rules did not find a recognizable database, upstream, timeout, or resource pattern. Review the events and add service-specific rules as needed.",
      evidence: logs.filter(log => log.severity === "ERROR" || log.severity === "WARN")
    });
  }

  hypotheses.forEach(hypothesis => {
    const card = document.createElement("article");
    card.className = "cause-card";
    const title = document.createElement("h3");
    title.textContent = hypothesis.title;
    const summary = document.createElement("p");
    summary.textContent = hypothesis.summary;
    card.append(title, summary);

    if (hypothesis.evidence.length) {
      const label = document.createElement("span");
      label.className = "evidence-title";
      label.textContent = "Supporting evidence";
      const list = document.createElement("ul");
      list.className = "evidence-list";
      hypothesis.evidence.slice(0, 5).forEach(event => {
        const item = document.createElement("li");
        item.textContent = `${formatTimestamp(event.timestamp)} · ${event.service} · ${event.severity} · ${event.message}`;
        list.appendChild(item);
      });
      card.append(label, list);
    }
    const caveat = document.createElement("p");
    caveat.className = "caveat";
    caveat.textContent = "Hypothesis only: matching log patterns do not establish causation.";
    card.appendChild(caveat);
    container.appendChild(card);
  });
}

logFileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    loadText(text, file.name);
  } catch (error) {
    setStatus("Could not read this file. Try a plain-text .log or .txt file.", "error");
  }
});

searchInput.addEventListener("input", renderLogs);
severityFilter.addEventListener("change", renderLogs);
$("clearFiltersBtn").addEventListener("click", () => {
  searchInput.value = "";
  severityFilter.value = "ALL";
  renderLogs();
});
$("loadSampleBtn").addEventListener("click", () => {
  loadText(SAMPLE_LOGS, "sample-outage.log");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

updateDashboard();
