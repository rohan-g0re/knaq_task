# Knaq — Solution, Design Notes & Feature Walkthrough

This is my answer sheet for the take-home. It does two things:

1. **[Feature walkthrough](#part-1--backend-how-each-piece-was-built)** — every feature I built, the
   mandatory ones and the bonuses, with how it works and where it lives in the code.
2. **[Design decisions & trade-offs](#design-decisions--trade-offs)** — the specific questions the
   assignment asks a `SOLUTION.md` to answer (storage, duplicates/malformed/breach handling,
   transition enforcement, Redux/RTK structure, source of truth, trade-offs, what's next, libraries),
   plus the **AI-tool disclosure** at the end.

Running instructions live in **[README.md](./README.md)**.

The guiding principle throughout: a deliberately small, *defensible* slice — the required must-/
should-haves built so every line is explainable, then the bonuses that were cheap given that
foundation.

---

# Part 1 — Backend: how each piece was built

### 1.1 Ingest & parse — `api/app/ingest.py`
A single pass over `sensor_messages.json` that branches on `message_type` (`reading` / `alert` /
`recovery`). Every message is wrapped in validation so a bad record is **quarantined, never fatal** —
on any failure I write the raw payload + a human reason to a `rejected_messages` table and `continue`.
Epoch-millisecond timestamps are converted to naive UTC at the door (`tz.from_epoch_ms`). The 7
rejects in the data are concrete and queryable (null timestamp, string timestamp, unknown
`UNKNOWN-999` device, missing severity, null `message_type`, missing `device_id`, empty inputs) —
stronger evidence than a log line that scrolls away. Ingest runs **once, only on an empty DB**, so a
fresh clone is deterministic and re-running never double-inserts. Verified counts:
`readings 1712, alerts 25, recoveries 15, duplicates 11, rejected 7, anomalies 4`.

### 1.2 Validate — `api/app/ingest.py`
- **Duplicates** — there's no message ID, so I define a dup as *identical content*: a
  `UNIQUE(device_id, ts_utc, input_name, input_value)` on readings and
  `UNIQUE(device_id, ts_utc, alert_type)` on alerts/recoveries, enforced with SQLite
  `INSERT … ON CONFLICT DO NOTHING`. The data's only dupes are fully-exact copies, so content keys are
  both correct and idempotent. (4 duplicate *messages* fan out to 11 duplicate reading *rows* because
  readings are long-format.)
- **Threshold breaches** — numeric inputs are compared to the device's `alert_thresholds` and the
  result is **flagged on the reading row** (`breached`, `breach_kind` like `current_high`,
  `threshold_value`) — not discarded, and deliberately *not* promoted into the alert queue (the *why*
  is in [Design decisions](#what-counts-as-a-triageable-alert) below).
- **Expected reading types** — an input the device doesn't declare (e.g. ELV-002 reporting
  `temperature`) is stored with `unexpected_type=true` and skipped for breach-checking rather than
  measured against a threshold it has no business having.
- **Required fields** — alert/recovery messages missing `alert_type` or `severity` are rejected.
- I also flag physically-impossible values (`current < 0`) as `suspect`.

### 1.3 Store — `api/app/models.py`, `api/app/schemas.py`
**SQLite via SQLAlchemy 2.0.** The schema mirrors the assignment's raw-signal-vs-triage-state split:

| Table               | Purpose |
| ------------------- | ------- |
| `devices`           | device registry (from `devices.json`) |
| `users`             | seeded token → user lookup |
| `readings`          | **long format, one row per sample** `(device_id, ts_utc, input_name, input_value)` + flag columns. Tidy time-series; per-type aggregation and per-value breach flagging are trivial. |
| `alerts`            | the device alerts, with **triage state inline** (`status`, `assigned_to`, `resolved_at`, `resolution_*`) — strictly 1:1 with the alert, so a separate table would add a join for zero benefit. |
| `alert_events`      | append-only **audit timeline**; the serializer nests it as `timeline`. An append-only table is the natural audit shape and avoids read-modify-write races on a JSON blob. |
| `recoveries`        | raw recovery signal (stored as context; humans still resolve) |
| `rejected_messages` | malformed-message quarantine (raw payload + reason) |

Each newly-ingested alert starts as `new` with a single `created` timeline entry. (The *why* behind
SQLite and the alerts-only triage decision is in [Design decisions](#storage-choice--schema).)

### 1.4 Authentication & multi-tenancy — `api/app/auth.py`, `api/app/seed.py`
A bearer token resolves to a `User` via `current_user`; a one-line `scoped(stmt, Model, user)` helper
appends `.where(Model.company == user.company)` to every list query, so tenant isolation is in one
place and hard to forget. Alerts carry a denormalized `company` (copied from the device at ingest) so
scoping is a single indexed predicate. I seeded **6 users across 3 companies** (Brookfield, Hines,
Mitsui Fudosan); mutations record `user.name` into the timeline. Bad token → `401`; cross-company
resource → `404` (I deliberately don't reveal that it exists).

### 1.5 REST API — `api/app/routers/{alerts,devices,users}.py`
All required read endpoints (`/alerts`, `/alerts/:id`, `/devices`, `/devices/:id`,
`/devices/:id/readings`, `/users`) and all four required mutations (`acknowledge`, `assign`,
`resolve`, `notes`) — each mutation returns the updated alert and appends a timeline entry. `/alerts`
supports the full filter set (`severity`, `status[]`, `device_id`, `assigned_to`, `q`, `from`, `to`).
**Timezone correctness** lives in `api/app/tz.py`: `/devices/:id/readings` parses `start`/`end` *as
the device's local time* → UTC for the query, and formats response timestamps back to **device-local
ISO-8601 with offset**. Verified: ESC-001 returns `+09:00` (Tokyo), CMP-003 `+00:00` (London, no Feb
DST). Errors use a consistent `{ error: { code, message } }` envelope — `401` bad token, `404`
missing/cross-company, `409` bad transition, `422` validation.

### Status transitions — `api/app/transitions.py`
One `TRANSITIONS` map + an `enforce(action, current)` function called by every mutation: it returns
the next status or raises `409` with a descriptive message ("Cannot resolve an alert in status
'new'. Allowed from: ['acknowledged']."). `assign` is allowed in any non-terminal status without
changing status. Centralizing it makes "transitions are enforced" a guarantee rather than something
each handler hopefully remembered, and the map is shaped so the bonus `dismiss`/`reopen` paths slot in
without touching callers. **The server is the source of truth** — the UI renders buttons by status as
a hint, but only the backend decides.

# Part 2 — Frontend: how each piece was built

### Screen 1 — Alert Queue — `web/src/app/alerts/page.tsx` (+ `features/alerts/components/`)
The main view. A **summary bar** (`SummaryBar`) shows counts by status, each clickable to filter;
those counts come from the whole company set (`counts_by_status`), independent of the active page.
`FilterBar` gives severity multi-select chips, a device dropdown, status chips, an assignee dropdown,
search, and sort. The `AlertTable` row shows severity indicator, title, device + building, **relative
trigger time** ("5m ago"), status badge, assignee (initials avatar or "Unassigned"), and quick
actions (Acknowledge if `new`, Assign, View). All three required states are real: a loading skeleton,
an empty state, and an error state with a Retry button. Multi-select checkboxes drive a bulk-action
bar.

### Screen 2 — Alert Detail — `web/src/app/alerts/[id]/page.tsx`
Header (title, severity chip, status badge, device + location), a metric card (`MetricCard`) showing
the triggered reading vs. threshold, and **contextual action buttons keyed off the current status** —
`new` shows Acknowledge, `acknowledged` shows Resolve, terminal states show Reopen (the backend still
decides). An assignment section with the current assignee + Change, a `Timeline` rendered from the
alert's `timeline` array (icon + user + action + timestamp + optional note, with a connecting line),
and an Add-Note form that posts to `/alerts/:id/notes`.

### Screen 3 — Resolve dialog — `web/src/features/alerts/components/ResolveDialog.tsx`
**Formik + Yup.** Resolution type (required select), root cause (required), action taken (required
textarea), preventive measures (optional), time spent (optional number, `≥ 0`). Validation surfaces
after a field is touched, and the submit button is disabled until the form is valid and dirty. On
submit it posts to `/alerts/:id/resolve` and surfaces success/error via a toast.

### Screen 4 — Assign dialog — `web/src/features/alerts/components/AssignDialog.tsx`
The team list from `/users` with initials avatars, name + role; the current assignee is highlighted; a
search field filters by name/role; an optional "Reason for assignment" note. The same component does
double duty for **bulk** assign (when given a list of ids).

### Theme + brand — `web/src/lib/theme/`
Dark + light mode via MUI `createTheme`, toggled from the app bar. The assignment's brand palette is
wired in (primary `#EFC01A`, secondary `#4B8189`, and the semantic error/warning/info/success
colors), and the same `STATUS_COLORS` / `SEVERITY_COLORS` constants drive chips, badges, and the
analytics charts so colors stay consistent everywhere.

### Frontend architecture — feature-based layout
`features/alerts/{api,components,hooks,slices,types}` + `lib/{store,theme,toast}`. **RTK Query
(`knaqApi`) owns all server state** — alerts, detail, devices, users, and every mutation — with
tag-based invalidation. **A Redux slice (`filtersSlice`) owns UI-only state** — the filter chips,
search, sort, and current page. (More on this split in [Design decisions](#frontend--redux--rtk-query-structure).)

# Bonus features

- **`dismiss` / `reopen` mutations** (`transitions.py`, detail-screen buttons) — the state machine
  extends cleanly; `reopen` clears the now-stale resolution so the record stays honest, and the
  `dismissed` summary bucket actually populates.
- **Optimistic `acknowledge` with rollback** (`knaqApi.ts` `onQueryStarted`) — the one-click,
  low-risk action patches the cache to `acknowledged` immediately and `patch.undo()`s on server
  rejection, then tag-invalidation reconciles to truth. Every other mutation is pessimistic.
- **Bulk actions** (`/alerts/bulk/*` + the queue's selection bar) — applied per-id server-side, so a
  mixed batch returns per-id outcomes (some `200`, some `409`) that `summarizeBulk` folds into one
  human sentence ("3 acknowledged, 1 failed").
- **Server-side pagination + sort** (`/alerts` envelope + MUI `<Pagination>`) — 10/page; sort and
  paging move server-side so they're consistent across the *whole* set (`sort=severity` → every
  critical on page 1), and any filter/sort change resets to page 1 so you never strand on an empty
  page.
- **Analytics dashboard** (`web/src/app/analytics/page.tsx`, ECharts, fed by `GET /alerts/stats`) —
  metric cards (MTTR, open-by-severity, resolved-this-week vs last, dismissal rate), a status donut, a
  resolution-time bar with dashed SLA `markLine`s, and a stacked volume-trend chart — all theme-aware
  so they stay legible in dark mode. (MTTR/SLA assumptions in [Design decisions](#analytics--mttr--sla-assumptions).)
- **Daily stats endpoint** (`GET /devices/:id/stats`) — avg/min/max/count per numeric reading type,
  bucketed by the **device-local** calendar day (reusing the `zoneinfo` conversion), so a reading at
  23:00 local lands on the local day, not the UTC day. Verified on ESC-001 (Tokyo +9): 51 readings
  cross the UTC↔local midnight boundary and bucket correctly. `motor_status` is excluded (a state code
  has no meaningful average).
- **Out-of-order message handling** — free by design: the file isn't timestamp-sorted and I never
  introduce an order dependency (every read is `ORDER BY ts_utc`, "latest" is `MAX(ts_utc)`).
- **Anomaly flagging** (`ingest.flag_anomalies`) — readings that are *in range* but unusual vs. the
  last 20 from the same device+input (z-score > 2.5) get an `anomaly` flag, distinct from a fixed
  threshold breach. Runs at ingest (4 flagged); surfacing it in the UI is on the "next week" list.
- **Tests** — one meaningful test per layer: a pytest API integration test (resolve-before-ack `409`,
  then ack→resolve `200`; plus company-scoping — a Hines token can't list or fetch a Brookfield
  alert → `404`) against a temp, freshly-seeded SQLite DB, and a Vitest reducer test for
  `filtersSlice` including the page-reset-on-filter/sort invariant.
- **Docker Compose** — `docker compose up --build` brings up API + web from a fresh clone (two
  services, SQLite on a named volume, API seeds + ingests on first boot). Validated end-to-end.

---

# Design decisions & trade-offs

This section answers the specific questions the assignment lists for `SOLUTION.md`.

## Storage choice & schema
**SQLite via SQLAlchemy 2.0.** The dataset is ~800 messages over 3 days — small, read-mostly, and
self-contained. SQLite means zero infra to run a fresh clone, and the schema is kept portable (plain
SQLAlchemy models) so swapping the URL to Postgres is a config change, not a rewrite. The table layout
is in [§1.3](#13-store--apiappmodelspy-apiappschemaspy); the key split is **raw signal**
(readings/alerts/recoveries) vs. **triage state** (the human workflow layered on an alert), with
triage state inline on the alert (1:1) and the audit trail in an append-only `alert_events` table.

### What counts as a "triageable alert"
Only the `message_type:"alert"` messages become triage items. Threshold-breaching *readings* are
flagged on the reading row, **not** promoted into the queue — the assignment treats "flagged readings"
and "ingested alerts" as different nouns ("flag, don't discard" vs. "triage state layered on an
ingested alert"). A breaching reading carries no `severity`/`alert_type`; promoting one would mean
*fabricating* a classification. So breaches stay queryable (`WHERE breached = 1`) as raw signal, and
the queue stays honest.

## Duplicates, malformed messages, threshold-breach flagging
Covered in detail in [§1.2](#12-validate--apiappingestpy): content-based unique constraints +
`ON CONFLICT DO NOTHING` for dupes (idempotent re-ingest for free); quarantine-to-`rejected_messages`
for malformed records (never crash — the 7 rejects are concrete and queryable); breach flags written
onto the reading row, with `motor_status` never breach-checked, undeclared types marked
`unexpected_type`, and impossible values marked `suspect`.

## Where status-transition enforcement lives & why
A single `TRANSITIONS` map + `enforce()` in `api/app/transitions.py`, called by every mutation handler
— see [Status transitions](#status-transitions--apiapptransitionspy). One place to read, one place to
change; impossible for a handler to forget. The server is authoritative; the frontend's status-keyed
buttons are a convenience, not the rule.

## Frontend — Redux / RTK Query structure
- **RTK Query (`knaqApi`) owns all server state** — alerts, detail, devices, users, and the mutations
  — with tag-based invalidation (`['Alert','Device','User']`). `prepareHeaders` injects the bearer
  token; the base URL comes from env.
- **A Redux slice (`filtersSlice`) owns UI-only state** — severity/status chips, device and assignee
  dropdowns, search, **sort, and the current page**. The whole slice is the RTK Query arg, so changing
  any of it re-fetches the scoped/filtered/sorted page. Sort and paging are **server-side** (10/page)
  so they stay consistent across the *entire* set, not just the visible rows. Any filter or sort
  change **resets to page 1** so you never strand on an empty page. The summary-bar counts double as a
  one-click status filter.

This is the rubric's "sensible split": cache/server data in RTK Query, ephemeral selection in slices.

## Source of truth & optimistic vs. pessimistic
The **server is the source of truth**. Mutations are **pessimistic by default**: await the server,
then `invalidatesTags(['Alert'])` refetches the queue and detail; on error (409 / 401 / network) a
toast surfaces the real message and the UI reconciles to server truth — it never flips status on its
own. This directly satisfies the E2E criterion "the frontend doesn't lie about state on failures."
**`acknowledge` is additionally optimistic** (the low-risk one-click action): `onQueryStarted` patches
the detail cache to `acknowledged` immediately and `patch.undo()`s on server rejection, then the tag
invalidation reconciles — the canonical "UI must reconcile if the backend says no" demo.

## Analytics — MTTR & SLA assumptions
Two documented calls behind `/analytics`:
- **MTTR / resolution time is the human-entered `time_spent_minutes`, not `resolved_at − created`.**
  The data is Feb 2026 but triage happens "now", so wall-clock deltas would be *months* and make the
  SLA line meaningless. The logged minutes are honest and demo-stable.
- **SLA targets are a small constant** (`Critical = 240 min / 4h` — the sheet's own example;
  `Warning = 1440 min / 24h` — my stated assumption), drawn as dashed `markLine`s. Metrics with no
  resolved alerts render `—` (null-safe).

## Trade-offs made under the time cap
- **`dismissed` is a real status reached only via the bonus `dismiss` mutation.** The summary bar
  shows the bucket rather than inventing a phantom `in_progress` state the spec explicitly forbids.
- **No time-shift on ingest** — timestamps are kept honest (Feb 2026), so relative times read "months
  ago." The demo-polish alternative would be to offset the window to "now," but I'd rather not rewrite
  the data.
- **Hand-written serializers** instead of Pydantic response models — fewer moving parts for the
  nested/derived alert shape; Pydantic still validates all request bodies.

## What I'd do with another week
Surface the `anomaly` flag in the queue/readings UI (the detection already runs at ingest), add
keyboard shortcuts on the queue (`A` to acknowledge the selection), and do an accessibility pass
(semantic roles, dialog focus management, contrast).

## Additional libraries
- **echarts + echarts-for-react** — the assignment's mandated charting stack for the analytics
  stretch.
- **dayjs** (+ `utc`, `timezone`, `relativeTime` plugins) — small, well-typed relative-time and
  device-local formatting on the client. (Correctness-critical tz math is server-side; dayjs only
  renders.)
- **@mui/material-nextjs** — official MUI ↔ Next App Router emotion cache integration (no FOUC).
- **vitest** (dev) — lightweight, Vite-native test runner for the frontend reducer test.

Everything else is mandated by the assignment (Next, MUI, Redux Toolkit, Formik, Yup) or stdlib
(`zoneinfo`); the backend deps are FastAPI, SQLAlchemy, Uvicorn, Pydantic, plus pytest/httpx for tests.

---

## AI tool disclosure
I used **Claude (Anthropic)** as a pair-programmer throughout: drafting the design decisions and this
implementation, generating boilerplate (ORM models, serializers, MUI components, the ECharts option
objects), and running the verification commands (ingest counts, the transition/scoping/timezone
checks, the analytics data path, and the Docker bring-up). I reviewed and edited all output — the
schema shape, the alerts-only triage decision, the breach-flag model, the transition/scoping design,
and the MTTR-from-logged-minutes call are deliberate choices, not accepted defaults. No other AI tools
were used.
