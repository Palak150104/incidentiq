"use strict";

// -----------------------------------------------
// DOM ELEMENTS
// -----------------------------------------------

const logFile = document.getElementById("logFile");
const searchInput = document.getElementById("searchInput");
const severityFilter = document.getElementById("severityFilter");
const clearFiltersButton = document.getElementById("clearFilters");

const logTable = document.getElementById("logTable");
const timeline = document.getElementById("timeline");
const rootCause = document.getElementById("rootCause");

const totalEvents = document.getElementById("totalEvents");
const errorCount = document.getElementById("errorCount");
const warningCount = document.getElementById("warningCount");
const serviceCount = document.getElementById("serviceCount");

const resultCount = document.getElementById("resultCount");
const timelineCount = document.getElementById("timelineCount");
const fileStatus = document.getElementById("fileStatus");

// All currently loaded log entries.
let logs = [];

// -----------------------------------------------
// LOG PARSER
// Expected format:
// 2026-10-21 10:02:01 ERROR database Connection failed
// -----------------------------------------------

function parseLogLine(line) {
    const pattern =
        /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s+(INFO|WARN|WARNING|ERROR|DEBUG|FATAL)\s+(\S+)\s+(.+)$/i;

    const match = line.trim().match(pattern);

    if (!match) {
        return null;
    }

    const timestamp = match[1].replace(" ", "T");
    const date = new Date(timestamp);

    // Check that the timestamp is valid.
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    let severity = match[2].toUpperCase();

    if (severity === "WARNING") {
        severity = "WARN";
    }

    if (severity === "FATAL") {
        severity = "ERROR";
    }

    return {
        timestamp,
        severity,
        service: match[3],
        message: match[4]
    };
}

// -----------------------------------------------
// DASHBOARD STATISTICS
// -----------------------------------------------

function updateStats() {
    totalEvents.textContent = logs.length;

    errorCount.textContent = logs.filter(
        log => log.severity === "ERROR"
    ).length;

    warningCount.textContent = logs.filter(
        log => log.severity === "WARN"
    ).length;

    serviceCount.textContent = new Set(
        logs.map(log => log.service)
    ).size;
}

// -----------------------------------------------
// SEARCH AND SEVERITY FILTER
// -----------------------------------------------

function getFilteredLogs() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedSeverity = severityFilter.value;

    return logs.filter(log => {
        const searchableText = [
            log.timestamp,
            log.severity,
            log.service,
            log.message
        ].join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(query);

        const matchesSeverity =
            selectedSeverity === "ALL" ||
            log.severity === selectedSeverity;

        return matchesSearch && matchesSeverity;
    });
}

// -----------------------------------------------
// LOG TABLE
// -----------------------------------------------

function renderLogs() {
    const filteredLogs = getFilteredLogs();

    resultCount.textContent =
        `${filteredLogs.length} event${filteredLogs.length === 1 ? "" : "s"}`;

    if (filteredLogs.length === 0) {
        logTable.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 4;
        cell.className = "empty";
        cell.textContent = logs.length === 0
            ? "Upload a log file to start investigating."
            : "No matching events found.";

        row.appendChild(cell);
        logTable.appendChild(row);
        return;
    }

    logTable.replaceChildren();

    filteredLogs.forEach(log => {
        const row = document.createElement("tr");

        const timestampCell = document.createElement("td");
        timestampCell.textContent = log.timestamp.replace("T", " ");

        const severityCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className = `severity ${log.severity}`;
        badge.textContent = log.severity;

        severityCell.appendChild(badge);

        const serviceCell = document.createElement("td");
        serviceCell.textContent = log.service;

        const messageCell = document.createElement("td");
        messageCell.textContent = log.message;

        row.append(
            timestampCell,
            severityCell,
            serviceCell,
            messageCell
        );

        logTable.appendChild(row);
    });
}

// -----------------------------------------------
// INCIDENT TIMELINE
// -----------------------------------------------

function renderTimeline() {
    const chronologicalLogs = [...logs].sort(
        (a, b) => a.timestamp.localeCompare(b.timestamp)
    );

    timelineCount.textContent =
        `${chronologicalLogs.length} events`;

    timeline.replaceChildren();

    if (chronologicalLogs.length === 0) {
        const empty = document.createElement("p");

        empty.className = "empty";
        empty.textContent =
            "Upload logs to generate an incident timeline.";

        timeline.appendChild(empty);
        return;
    }

    chronologicalLogs.forEach(log => {
        const item = document.createElement("div");
        item.className = "timeline-item";

        const marker = document.createElement("div");
        marker.className = `timeline-marker ${log.severity}`;

        const time = document.createElement("div");
        time.className = "timeline-time";
        time.textContent = log.timestamp.replace("T", " ");

        const content = document.createElement("div");
        content.className = "timeline-content";

        const heading = document.createElement("strong");
        heading.textContent = `${log.severity} · ${log.service}`;

        const message = document.createElement("p");
        message.textContent = log.message;

        content.append(heading, message);
        item.append(marker, time, content);

        timeline.appendChild(item);
    });
}

// -----------------------------------------------
// ROOT-CAUSE HYPOTHESIS ENGINE
// This uses transparent rules, not AI.
// Hypotheses are not confirmed root causes.
// -----------------------------------------------

function renderRootCause() {
    rootCause.replaceChildren();

    if (logs.length === 0) {
        const empty = document.createElement("p");

        empty.className = "empty";
        empty.textContent =
            "Upload logs to generate potential root-cause hypotheses.";

        rootCause.appendChild(empty);
        return;
    }

    const sortedLogs = [...logs].sort(
        (a, b) => a.timestamp.localeCompare(b.timestamp)
    );

    const hypotheses = [];

    // Rule 1: Database connectivity failures.
    const databaseErrors = sortedLogs.filter(log =>
        log.severity === "ERROR" &&
        /database|connection pool|connection refused|connection attempt|sqlstate/i
            .test(`${log.service} ${log.message}`)
    );

    if (databaseErrors.length > 0) {
        hypotheses.push({
            title: "Possible database connectivity failure",
            explanation:
                "Database-related errors were observed. Check database availability, connection-pool limits, credentials, and network connectivity.",
            evidence: databaseErrors.slice(0, 3)
        });
    }

    // Rule 2: Gateway and upstream failures.
    const gatewayErrors = sortedLogs.filter(log =>
        log.severity === "ERROR" &&
        /gateway|upstream|504|502|503/i.test(log.message)
    );

    if (gatewayErrors.length > 0) {
        hypotheses.push({
            title: "Possible upstream service disruption",
            explanation:
                "Gateway or upstream errors may indicate an unavailable or slow dependency. Inspect upstream health and request timeouts.",
            evidence: gatewayErrors.slice(0, 3)
        });
    }

    // Rule 3: Timeout and latency events.
    const timeoutEvents = sortedLogs.filter(log =>
        ["ERROR", "WARN"].includes(log.severity) &&
        /timeout|timed out|latency/i.test(log.message)
    );

    if (timeoutEvents.length > 0) {
        hypotheses.push({
            title: "Possible request latency or timeout issue",
            explanation:
                "Timeout or latency events were observed. Investigate slow dependencies, resource saturation, and configured timeout thresholds.",
            evidence: timeoutEvents.slice(0, 3)
        });
    }

    // Rule 4: Repeated errors from the same service.
    const errorCounts = new Map();

    sortedLogs
        .filter(log => log.severity === "ERROR")
        .forEach(log => {
            errorCounts.set(
                log.service,
                (errorCounts.get(log.service) || 0) + 1
            );
        });

    for (const [service, count] of errorCounts) {
        if (count >= 3) {
            const serviceErrors = sortedLogs.filter(
                log =>
                    log.service === service &&
                    log.severity === "ERROR"
            );

            hypotheses.push({
                title: `Repeated failures in ${service}`,
                explanation:
                    `${count} error events were recorded for this service. Check service-specific logs and dependencies for a recurring failure pattern.`,
                evidence: serviceErrors.slice(0, 3)
            });
        }
    }

    if (hypotheses.length === 0) {
        const empty = document.createElement("p");

        empty.className = "empty";
        empty.textContent =
            "No known failure patterns detected. This does not prove the system is healthy.";

        rootCause.appendChild(empty);
        return;
    }

    hypotheses.forEach(hypothesis => {
        const card = document.createElement("article");
        card.className = "hypothesis";

        const heading = document.createElement("h3");
        heading.textContent = hypothesis.title;

        const explanation = document.createElement("p");
        explanation.textContent = hypothesis.explanation;

        const evidenceLabel = document.createElement("p");
        evidenceLabel.className = "evidence-label";
        evidenceLabel.textContent = "Supporting evidence";

        const evidenceList = document.createElement("ul");
        evidenceList.className = "evidence-list";

        hypothesis.evidence.forEach(log => {
            const item = document.createElement("li");

            item.textContent =
                `${log.timestamp.replace("T", " ")} · ` +
                `${log.service} · ${log.severity} · ${log.message}`;

            evidenceList.appendChild(item);
        });

        const note = document.createElement("p");
        note.className = "hypothesis-note";
        note.textContent =
            "Hypothesis only: event order and matching patterns do not establish causation.";

        card.append(
            heading,
            explanation,
            evidenceLabel,
            evidenceList,
            note
        );

        rootCause.appendChild(card);
    });
}

// -----------------------------------------------
// UPLOAD AND VALIDATE LOG FILE
// -----------------------------------------------

logFile.addEventListener("change", async event => {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    // Basic client-side file validation.
    const validExtension = /\.(log|txt)$/i.test(file.name);
    const maxFileSize = 5 * 1024 * 1024;

    if (!validExtension) {
        showFileStatus("Choose a .log or .txt file.", "error");
        logFile.value = "";
        return;
    }

    if (file.size > maxFileSize) {
        showFileStatus("File is too large. Maximum size is 5 MB.", "error");
        logFile.value = "";
        return;
    }

    try {
        const content = await file.text();
        const lines = content.split(/\r?\n/);

        const parsedLogs = [];
        let skippedLines = 0;

        lines.forEach(line => {
            if (!line.trim()) {
                return;
            }

            const parsedLog = parseLogLine(line);

            if (parsedLog) {
                parsedLogs.push(parsedLog);
            } else {
                skippedLines++;
            }
        });

        if (parsedLogs.length === 0) {
            showFileStatus(
                "No valid log entries found. The file must match the expected format.",
                "error"
            );
            return;
        }

        logs = parsedLogs;

        updateStats();
        renderLogs();
        renderTimeline();
        renderRootCause();

        const message = skippedLines > 0
            ? `Loaded ${logs.length} events from ${file.name}; skipped ${skippedLines} unrecognized lines.`
            : `Loaded ${logs.length} events from ${file.name}.`;

        showFileStatus(message, "success");
    } catch (error) {
        console.error("Log upload failed:", error);

        showFileStatus(
            "Unable to read this file. Please try another file.",
            "error"
        );
    }
});

// -----------------------------------------------
// SEARCH, FILTERS, AND RESET
// -----------------------------------------------

searchInput.addEventListener("input", renderLogs);
severityFilter.addEventListener("change", renderLogs);

clearFiltersButton.addEventListener("click", () => {
    searchInput.value = "";
    severityFilter.value = "ALL";
    renderLogs();
});

// -----------------------------------------------
// STATUS MESSAGE
// -----------------------------------------------

function showFileStatus(message, type = "") {
    fileStatus.textContent = message;
    fileStatus.className = "file-status";

    if (type) {
        fileStatus.classList.add(type);
    }
}

// -----------------------------------------------
// INITIALIZE DASHBOARD
// -----------------------------------------------

updateStats();
renderLogs();
renderTimeline();
renderRootCause();
