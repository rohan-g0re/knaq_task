# Full-Stack Engineer Take-Home Assessment

## Knaq — IoT Alert Triage & Resolution System

**Candidate:** _______________
**Time Budget:** ~8–10 hours of focused work. **Return within 2 calendar days of receipt.** AI coding tools are expected — disclose what you used in `SOLUTION.md`.

> If you find yourself well past 10 hours, **stop**. Submit what you have and write down what you'd have done next in `SOLUTION.md`. We'd rather see a smaller, polished slice with clear thinking about the gaps than an over-scoped submission.
> **Date Issued:** _______________
> **Submission Deadline:** _______________

---

## Context

Knaq is an IoT equipment monitoring platform. Devices deployed across buildings (elevators, escalators, compressors, HVAC, pumps) push raw messages to the cloud — sensor readings, motor status changes, threshold-breach alerts, and recoveries.

Today, two critical gaps exist:

1. **Raw device messages are not ingested or validated** into structured, queryable storage. There's no API to ask "what's currently alerting on this device?" or "show me all critical alerts for this company in the last 24 hours."
2. **When alerts fire, they sit in a table.** There's no way to acknowledge, assign, triage, or resolve them — and no audit trail of how the team handled them.

You will build a **full-stack alert triage system** that closes both gaps end-to-end:

- A **backend service** that ingests raw device messages, validates them, persists them, and exposes a REST API for alerts and readings (timezone-aware, multi-tenant).
- A **web frontend** that lets a building manager triage those alerts — acknowledge, assign, work, resolve, dismiss, and leave a clear audit trail.

The two services live in one repo and talk to each other over HTTP. The frontend uses **no mock data** — it reads from and writes to the backend you build.

---

## Repository Layout

Single repo, two services:

```
your-submission/
  api/               # backend service (your language of choice)
  web/               # Next.js + TypeScript frontend
  data/
    devices.json            # provided — device registry
    sensor_messages.json    # provided — ~800 raw device messages
  docker-compose.yml        # bonus: one-command bring-up of api + db + web
  README.md                 # your top-level README (setup + design)
  SOLUTION.md               # your design decisions + trade-offs (required)
```

Copy `devices.json` and `sensor_messages.json` from this assignment package into `data/` when you bootstrap.

---

## Part 1 — Backend (`/api`)

**Language:** Your choice. Use whatever you're most productive in.
**Database:** Your choice. Be prepared to defend the schema.

### Stage 1.1 — Ingest & Parse

Read all messages from `data/sensor_messages.json`. Distinguish between the message types (`reading`, `alert`, `recovery`). Handle malformed or incomplete messages gracefully — log them, don't crash. The data is intentionally not perfectly clean.

**Provided data:**

`devices.json` — 10 devices with metadata:

| Field                | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `device_id`        | Unique identifier (e.g.,`ELV-001`, `CMP-002`)                            |
| `type`             | `elevator`, `escalator`, or `compressor`                               |
| `company`          | Owning company (e.g.,`"Brookfield Properties"`)                            |
| `timezone`         | IANA timezone where deployed (e.g.,`America/New_York`)                     |
| `reading_types`    | What this device measures                                                    |
| `alert_thresholds` | Twin-configured thresholds the device uses to trigger alerts                 |
| Other                | `name`, `location`, `installed_date`, `floor_count` (elevators only) |

`sensor_messages.json` — ~800 messages over a 3-day window. **No message ID.** All timestamps are **epoch milliseconds (UTC).**

Message shapes:

**Sensor Reading**

```json
{ "device_id": "ELV-001", "message_type": "reading", "timestamp": 1770737458000,
  "inputs": [{ "input_name": "current", "input_value": 58.94 }] }
```

**Motor Status** (a reading with `motor_status` input, `1` = started, `0` = stopped)

```json
{ "device_id": "ESC-001", "message_type": "reading", "timestamp": 1770706542000,
  "inputs": [{ "input_name": "motor_status", "input_value": 1 }] }
```

**Alert** (device-detected threshold breach; some non-threshold alerts like `door_fault`, `vibration_anomaly` omit `threshold`/`reading_value`/`reading_name`)

```json
{ "device_id": "CMP-001", "message_type": "alert", "timestamp": 1770924235000,
  "alert_type": "high_temperature", "severity": "critical",
  "threshold": 130, "reading_value": 136.51, "reading_name": "temperature" }
```

**Recovery** (condition returned to normal)

```json
{ "device_id": "CMP-001", "message_type": "recovery", "timestamp": 1770927835000,
  "alert_type": "high_temperature", "severity": "critical",
  "threshold": 130, "reading_value": 118.42, "reading_name": "temperature" }
```

### Stage 1.2 — Validate

- Validate sensor readings against the device's `alert_thresholds`. Readings that breach a threshold should be flagged — stored separately, not discarded.
- Detect and handle **duplicate messages** (no message ID — you decide what constitutes a duplicate).
- Validate readings match the device's expected `reading_types`.
- Validate alert/recovery messages have required fields (`device_id`, `timestamp`, `alert_type`, `severity`, `message_type`).

### Stage 1.3 — Store

Persist validated data. **You choose the storage and schema.** This is a deliberate part of the evaluation — be prepared to explain your choices in `SOLUTION.md`.

Two distinct concerns to model:

1. **Raw signal** — readings, ingested alerts, recoveries. High-volume, append-only, time-series-ish.
2. **Triage state** — the human workflow layered on top of an ingested alert. Each alert gains the following fields (you may model these inline or in a separate table — your call, document the choice):

```
status              new | acknowledged | resolved | dismissed
assigned_to         user id, nullable
acknowledged_at     timestamp, nullable
resolved_at         timestamp, nullable
resolution_type     fixed | false_alarm | known_issue | deferred | cannot_reproduce, nullable
resolution_root_cause, resolution_action_taken, resolution_preventive_measures, resolution_time_spent_minutes
timeline            ordered list of {timestamp, action, user, details, note?}
```

The `dismissed` state is reachable only via the bonus `dismiss` mutation; the required path is `new → acknowledged → resolved`.

Newly ingested alerts start in `status = new` with an empty `timeline` containing a single `created` entry.

### Stage 1.4 — Authentication & Multi-Tenancy

Requests carry a **bearer token** representing a user. The token resolves to a user record with a `company` and a `name`/`role` — implement however you like (hardcoded users, signed JWT, simple lookup table — just show the wiring works). All list endpoints must filter to the requesting user's company. Mutations record `user.name` into the timeline.

Seed 5–6 users across at least 2 companies — one of them is the "current user" the frontend will authenticate as.

### Stage 1.5 — REST API

**Read endpoints** (all results scoped to requester's company):

| Method  | Path                      | Notes                                                                                                                                                                |
| ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET` | `/alerts`               | List alerts. Filters:`severity`, `status[]`, `device_id`, `assigned_to`, `q` (search title/device), `from`, `to`. Pagination optional but recommended. |
| `GET` | `/alerts/:id`           | Full alert + timeline.                                                                                                                                               |
| `GET` | `/devices`              | List devices visible to this company.                                                                                                                                |
| `GET` | `/devices/:id`          | Device detail.                                                                                                                                                       |
| `GET` | `/devices/:id/readings` | **Required:** `start` and `end`. Time params are in **device's local timezone**; response timestamps also in **device local timezone**.        |
| `GET` | `/users`                | Team members visible for assignment.                                                                                                                                 |

**Triage mutations** — required (return the updated alert, append a `timeline` entry, enforce status transitions — see below):

| Method   | Path                        | Body                                                                                         |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `POST` | `/alerts/:id/acknowledge` | (none)                                                                                       |
| `POST` | `/alerts/:id/assign`      | `{ assignee_id, note? }`                                                                   |
| `POST` | `/alerts/:id/resolve`     | `{ resolution_type, root_cause, action_taken, preventive_measures?, time_spent_minutes? }` |
| `POST` | `/alerts/:id/notes`       | `{ note }`                                                                                 |

**Bonus mutations** (not required): `POST /alerts/:id/dismiss`, `POST /alerts/:id/reopen`, and bulk variants (`POST /alerts/bulk/acknowledge`, `POST /alerts/bulk/assign`).

### Status transition rules (enforce server-side)

Required path:

```
new            → acknowledged
acknowledged   → resolved | (reassign)
```

Bonus paths (only if you implement dismiss / reopen):

```
new | acknowledged   → dismissed
resolved             → reopened (→ acknowledged)
dismissed            → reopened (→ acknowledged)
```

`assign` is allowed in any non-terminal status and does not change `status`. Invalid transitions return `409 Conflict` with a clear error message. The frontend should render the right action buttons based on current status, but the backend is the source of truth.

> Note: there is no separate `in_progress` state. "Acknowledged" means someone owns it and is working on it. False alarms are captured via `resolve` with `resolution_type: false_alarm`, not via a separate flow.

---

## Part 2 — Frontend (`/web`)

### Tech Stack

| Requirement      | Details                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| Framework        | **Next.js 14+** with App Router                                                 |
| Language         | **TypeScript** (strict — no `any`)                                           |
| UI Library       | **MUI v5+**                                                                     |
| State Management | **Redux Toolkit** (RTK Query encouraged for server data)                        |
| Forms            | **Formik + Yup**                                                                |
| Charts           | **ECharts** (`echarts-for-react`) — only if you tackle the analytics stretch |
| Data             | **Live HTTP calls to your `/api` service.** No mock data, no MSW.             |

The frontend ships with a configurable API base URL (env var) and a hardcoded or env-supplied bearer token representing the "logged-in" user.

### Required Screens

#### Screen 1 — Alert Queue (main view)

- Top: Summary bar with counts by status (New, Acknowledged, In Progress, Resolved, Dismissed). Each count clickable to filter.
- Filter controls: severity (multi-select chips), building/device (dropdown), status (tabs or chips), search by device or title.
- Alert list/table — each row: severity indicator, alert title, device + building, triggered time (relative — "5m ago"), status badge, assignee (avatar or "Unassigned"), quick actions.
- Quick actions per row: Acknowledge (if `new`), Assign, View Detail.
- Sort by: severity, time, status.
- **States:** loading skeleton, empty state, error state.
- Bulk multi-select with checkboxes → bulk action bar (bonus if API doesn't support bulk; do it client-side as fan-out).

#### Screen 2 — Alert Detail

- Header: title, severity, status, device name + location.
- Metric card: triggered reading vs. threshold (e.g., "CO2: 1200 ppm / Threshold: 1000 ppm").
- **Contextual action buttons** based on current status:
  - `NEW` — Acknowledge · Assign
  - `ACKNOWLEDGED` — Resolve · Assign
  - `RESOLVED` / `DISMISSED` — (read-only in the required scope; Reopen is bonus)
- Assignment section: current assignee + "Change" button.
- Timeline: chronological list from the alert's `timeline` array. Icon + user + action + timestamp + optional note. Connecting line between entries.
- Add Note form: text input + submit → calls `POST /alerts/:id/notes`.

#### Screen 3 — Resolve Alert Dialog

Opens from "Resolve" button. Form fields:

- **Resolution Type** (required): Fixed / False Alarm / Known Issue / Deferred / Cannot Reproduce
- **Root Cause** (required): text input
- **Action Taken** (required): textarea
- **Preventive Measures** (optional): textarea
- **Time Spent** (optional): number input, minutes

Inline validation after touch. Submit disabled until valid. On submit → `POST /alerts/:id/resolve`.

#### Screen 4 — Assign Alert Dialog

- List of team members (from `GET /users`): avatar (initials), name, role.
- Highlight current assignee.
- Filter/search field.
- Optional note ("Reason for assignment").
- Assign button → `POST /alerts/:id/assign`.

### Stretch Screen — Resolution Analytics (bonus)

If time allows, build a dashboard tab with ECharts:

- **Metrics cards:** MTTR (mean time to resolve), open count by severity, resolved this week (with trend vs. last week), dismissal rate.
- **Alerts by Status** donut.
- **Resolution Time by Severity** bar chart with an SLA target line (e.g., "Critical: 4h").
- **Alert Volume Trend** line chart over 7/30 days, severity series, area fill.

You may need to add a `GET /alerts/stats` or `GET /alerts/timeseries` endpoint to support this — that's part of the stretch.

### Theme + Brand

- Dark + light mode via MUI `createTheme`. Toggle reachable from the UI chrome.
- Brand colors:
  - Primary `#EFC01A` (gold) · Secondary `#4B8189` (teal)
  - Error `#F44336` · Warning `#FFA726` · Info `#29B6F6` · Success `#66BB6A`

### Project Structure (suggested)

```
web/src/
  app/                  # Next.js App Router pages
    alerts/             # queue page
    alerts/[id]/        # detail page
    analytics/          # stretch
    layout.tsx
  features/
    alerts/
      api/              # RTK Query endpoints
      components/
      hooks/
      types/
      slices/           # for client-only state (filters, selection, etc.)
  components/           # shared UI
  lib/
    store/              # Redux store
    theme/              # MUI theme
    auth/               # token handling
```

---

## What We're Evaluating

| Area                                   | Weight | What we look for                                                                                                                                                                                                    |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data ingest & storage design** | 25%    | Schema fits the data. Handles dupes, malformed records, threshold-breach flagging. You can explain why you picked your storage.                                                                                     |
| **API design & correctness**     | 25%    | Endpoints return correct, company-scoped data. Timezone math is right. Status transitions enforced server-side with sensible errors. Reasonable HTTP semantics and error responses.                                 |
| **Frontend architecture**        | 15%    | Clean feature-based structure. Strict TypeScript. Sensible split between server state (RTK Query / cache) and client state (filters, selection). Reusable abstractions where they pay off — not where they don't.  |
| **UI/UX & product thinking**     | 10%    | Triage workflow feels intuitive. Real loading / empty / error states. Form validation is helpful, not annoying. Timeline is readable. Status/severity colors are consistent. Looks like a product, not a prototype. |
| **End-to-end integration**       | 15%    | It actually works across the wire. Error states handled (network failures, 409 on bad transitions, 401 on bad token). The frontend doesn't lie about state on failures.                                             |
| **Documentation & reasoning**    | 10%    | `SOLUTION.md` is honest about trade-offs and what you'd do with more time. Setup instructions work. AI tool usage disclosed.                                                                                      |

### Bonus (not required, in rough order of value)

- Dockerized — `docker-compose up` brings up api + db + web.
- Stretch analytics screen with charts.
- Optimistic UI updates that correctly roll back on server rejection.
- `dismiss` and `reopen` mutations (with corresponding UI buttons on the Detail screen).
- Bulk actions (API + UI).
- Pagination on list endpoints.
- Daily aggregate stats endpoint (`GET /devices/:id/stats` — avg/min/max/count per reading type per local-tz day).
- Out-of-order message handling.
- Tests — at least one meaningful API integration test and one frontend component/hook test.
- Anomaly flagging on readings within range but unusual vs. recent history.
- Keyboard shortcuts on the queue (e.g., `A` to acknowledge selected).
- Accessibility pass (semantic roles, focus management on dialogs, contrast).

---

## Prioritization Guide

If you're running low on time:

1. **Must have** (do these first):

   - Backend ingest → storage with alerts queryable by company
   - `GET /alerts`, `GET /alerts/:id`, plus the four required mutations (`acknowledge`, `assign`, `resolve`, `notes`) with transition rules enforced server-side
   - Frontend Alert Queue + Alert Detail wired to live API
   - Status transitions enforced and reflected in UI
2. **Should have**:

   - Resolve + Assign dialogs with validation
   - Add Note + timeline rendering
   - Filtering and search on the queue
   - Dark/light theme toggle
   - Reasonable error UX (failed mutations don't silently swallow)
3. **Nice to have** (stretch):

   - Bulk actions
   - Analytics tab with charts
   - Pagination
   - Tests
   - Docker compose

**A polished must-have slice is worth far more than a half-finished everything.**

---

## Submission

1. Top-level `README.md` should explain:
   - How to set up and run both services (and the DB, if separate).
   - Required environment variables.
   - Where to find seeded users / tokens for testing.
2. `SOLUTION.md` at the repo root must cover:
   - Storage choice and schema reasoning.
   - How you handle duplicates, malformed messages, and threshold-breach flagging.
   - Where you put status-transition enforcement and why.
   - How you structured Redux / RTK Query state.
   - Where the source of truth lives (server vs. client) for alert state, and how you handled optimistic vs. pessimistic updates.
   - Trade-offs made under the time cap.
   - What you'd improve with another week.
   - Any additional libraries you added and why.
   - **AI tool disclosure** — what you used (Copilot, ChatGPT, Claude, etc.) and how. We value transparency; it's not a deduction.
3. Verify a fresh clone runs cleanly. Document the exact commands.

---

## Tips

- **Start with the data model on both sides.** The shape of an `Alert` row in your DB and the shape of the `Alert` TypeScript interface in the frontend are the contract. Get them aligned first, then build outward.
- **Server is the source of truth for status.** The frontend can show optimistic transitions, but the backend enforces the rules. If the backend says no, the UI must reconcile.
- **Timezones matter.** The BE's "local-time" responses are a real correctness call. Don't fudge it with `new Date().toLocaleString()` in the frontend — handle it properly server-side.
- **Mock data should feel real where you do generate it** (e.g., seeded users, alert titles/descriptions derived from real threshold breaches in `sensor_messages.json`).
- **Document assumptions.** If anything is ambiguous, state your assumption in `SOLUTION.md` and proceed.

---

## What We're NOT Evaluating

- Pixel-perfect design (consistent MUI usage and clear UX is what we care about, not custom CSS artistry).
- Production deploy or CI/CD pipelines.
- Test coverage as a number — but at least one well-chosen test per layer is a strong signal.
- Performance tuning under load (correctness first, premature optimization is still bad).

---

## Questions?

Email [INSERT_EMAIL]. We respond within 4 business hours. The clock pauses while you wait.

Good luck!
