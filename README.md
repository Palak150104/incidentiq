# IncidentIQ — Production Incident Investigator

IncidentIQ is a browser-based log investigation dashboard for exploring application logs, spotting error patterns, correlating events, and generating rule-based root-cause hypotheses.

## Features

- Upload `.log` and `.txt` files
- Parse timestamp, severity, service, and message fields
- Summary cards for total events, errors, warnings, and unique services
- Search logs and filter by severity
- Chronological incident timeline
- Correlate warning/error events within a five-minute window
- Rule-based root-cause hypotheses with supporting evidence
- Responsive dark interface

## Run locally

1. Download or clone this repository.
2. Open the `incidentiq` folder in VS Code.
3. Open `index.html` in a browser, or use the VS Code Live Server extension.
4. Click **Load sample data**, or upload `samples/outage.log`.

No build tools, dependencies, server, or API keys are required for this frontend prototype.

## Expected log format

```text
2026-10-21 10:02:02 ERROR database Connection pool exhausted
```

Each parsed line contains a timestamp, severity (`TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`, or `CRITICAL`), service name, and message. Unrecognized lines are skipped and reported.

## Technical notes

- Built with HTML, CSS, and vanilla JavaScript.
- Log parsing and analysis run in the browser.
- Correlation groups significant events that occur within five minutes of the first event in a group.
- Root-cause suggestions are deterministic rules, not AI-generated diagnoses. Correlation and matching patterns do not prove causation.
- This prototype does not persist uploaded logs or send them to a server.

## Roadmap

1. Add parser unit tests and more log formats.
2. Move parsing and analysis into a Node.js API.
3. Persist normalized events and incident groups in PostgreSQL.
4. Add configurable correlation windows and service dependency mapping.
5. Add tests, structured error handling, and deployment.

## Project structure

```text
incidentiq/
├── index.html
├── style.css
├── script.js
├── README.md
└── samples/
    └── outage.log
```

## License

Add a license before distributing this project for reuse.
