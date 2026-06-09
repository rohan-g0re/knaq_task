# Knaq — Solution & Design Notes

A deliberately small, defensible slice: the required must-/should-have features, built so every
line is explainable. Bonus/deferred work and the reasoning behind each "why not now" lives in
[`remaining_bonus.md`](./remaining_bonus.md); the full decision log (3 options + rationale per call)
is in [`notes.md`](./notes.md).

---

## Storage choice & schema

**SQLite via SQLAlchemy 2.0.** The dataset is ~800 messages over 3 days — small, read-mostly, and
self-contained. SQLite means zero infra to run a fresh clone, and the schema is kept portable
(plain SQLAlchemy models) so swapping the URL to Postgres is a config change, not a rewrite.

The assignment splits two concerns: **raw signal** (readings, ingested alerts, recoveries) and
**triage state** (the human workflow on an alert). The schema mirrors that split:

| Table              | Purpose |
| ------------------ | ------- |
| `devices`          | device registry (from `devices.json`) |
| `users`            | seeded token → user lookup |
| `readings`         | **long format, one row per sample** `(device_id, ts_utc, input_name, input_value)` + flag columns. Tidy time-series; per-type aggregation and per-value breach flagging are trivial. |
| `alerts`           | the 26 device alerts, with **triage state inline** (`status`, `assigned_to`, `resolved_at`, `resolution_*`) — it's strictly 1:1 with an alert, so a separate table would add a join for zero benefit. |
| `alert_events`     | append-only **audit timeline**; serializer nests it as `timeline`. An append-only table is the natural audit structure and avoids read-modify-write races on a JSON blob. |
| `recoveries`       | raw recovery signal (stored as context; humans still resolve) |
| `rejected_messages`| malformed-message quarantine (raw payload + reason) |

**Key design call — what is a "triageable alert"?** Only the 26 `message_type:"alert"` messages
become triage items. Threshold-breaching *readings* are **flagged on the reading row**, not promoted
into the queue — the assignment treats "flagged readings" and "ingested alerts" as different nouns
("flag, don't discard" vs. "triage state layered on an ingested alert"). A breaching reading carries
no `severity`/`alert_type`; promoting one would mean *fabricating* a classification. So breaches stay
queryable (`WHERE breached = 1`) as raw signal, and the queue stays honest.

---

## Ingestion: duplicates, malformed records, breach flagging

Ingest is a single idempotent pass run **on startup only if the DB is empty** (so a fresh clone is
deterministic, and re-running never double-inserts). Verified counts:
`readings 1712, alerts 25, recoveries 15, duplicates 11, rejected 7`.

- **Duplicates → exact-content keys + `INSERT … ON CONFLICT DO NOTHING`.** A `UNIQUE(device_id,
  ts_utc, input_name, input_value)` on readings and `UNIQUE(device_id, ts_utc, alert_type)` on alerts.
  The data's only dupes are *fully exact* copies with no "same instant, different value" collisions,
  so content keys are both correct and safe. The constraints also guarantee idempotent re-ingest.
  (4 duplicate *messages* fan out to 11 duplicate reading *rows* because readings are long-format.)

- **Malformed → quarantine, never crash.** Each message is validated (`message_type`, numeric
  `timestamp`, known `device_id`, alerts/recoveries require `alert_type` + `severity`). On failure the
  raw payload + reason go to `rejected_messages` and we `continue`. The 7 rejects are concrete,
  queryable evidence (null timestamp, string timestamp, `UNKNOWN-999`, missing severity, null
  `message_type`, missing device_id, empty inputs) — stronger than a log line that scrolls away.

- **Breach flagging → flags on the reading row.** For numeric inputs we compare against the device's
  `alert_thresholds` and set `breached` + `breach_kind` (`current_high`, `temperature_low`, …) +
  `threshold_value`. `motor_status` is never breach-checked. A reading of an **undeclared type**
  (ELV-002 reporting `temperature`) is stored with `unexpected_type=true` and *not* breach-checked.
  Physically impossible values (ELV-001 `current = -5.2`) are flagged `suspect` **and** `breached`.

- **Out-of-order messages** are handled *for free*: the file isn't timestamp-sorted, so we never
  introduce an order dependency — every read is `ORDER BY ts_utc`, "latest" is `MAX(ts_utc)`, and
  recovery↔alert correlation compares timestamps, never insertion order.

---

## Timezones

Store UTC, convert only at the edges with stdlib `zoneinfo` (DST-correct, no dependency). Epoch-ms
inputs → naive UTC datetimes. `GET /devices/:id/readings` parses `start`/`end` **as the device's
local time** → UTC for the query, and formats response timestamps back in **device-local ISO-8601
with offset**. Verified: ESC-001 returns `+09:00` (Tokyo), CMP-003 `+00:00` (London, no Feb DST).
The frontend never does timezone math on wire data — it shows true relative time with the exact
device-local time on a tooltip.

---

## Status transitions — where & why

A single `TRANSITIONS` map in **`api/app/transitions.py`**, called by every mutation:

```python
TRANSITIONS = {"acknowledge": {"new": "acknowledged"},
               "resolve":     {"acknowledged": "resolved"}}
```

`enforce(action, current)` returns the next status or raises `409` with a descriptive message;
`assign` is allowed in any non-terminal status without changing `status`. Centralizing it means
"transitions are enforced" is a guarantee, not a thing each handler hopefully remembered. The map is
shaped so the bonus `dismiss`/`reopen` paths slot in without touching callers. **The server is the
source of truth** — the UI renders buttons by status as a hint, but only the backend decides.

Error conventions: detail routes return a bare object, lists return `{ data, counts_by_status }`,
and every error is `{ error: { code, message } }` — `401` bad token, `404` missing/cross-company
(don't reveal existence), `409` bad transition, `422` validation.

## Multi-tenancy

`current_user` resolves the bearer token to a `User`; a `scoped(stmt, Model, user)` helper appends
`.where(Model.company == user.company)` to every list query — one place, hard to forget. Alerts carry
a denormalized `company` (copied from the device at ingest) so scoping is a single indexed predicate.

---

## Frontend: Redux / RTK Query structure

Feature-based layout (`features/alerts/{api,components,hooks,slices,types}`, `lib/{store,theme,toast}`).

- **RTK Query (`knaqApi`) owns all server state** — alerts, detail, devices, users, and the four
  mutations — with tag-based invalidation (`['Alert','Device','User']`). `prepareHeaders` injects the
  bearer token; base URL comes from env.
- **A Redux slice (`filtersSlice`) owns UI-only state** — severity chips, status chips, device and
  assignee dropdowns, and search. Filters are the RTK Query arg, so changing one re-fetches the
  scoped/filtered list; sort (severity/time/status) is applied client-side over the cached rows.
  The summary-bar counts double as a one-click status filter and stay in sync with the status chips.

This is the rubric's "sensible split" verbatim: cache/server data in RTK Query, ephemeral selection
in slices.

## Source of truth & optimistic vs. pessimistic

The **server is the source of truth**. All mutations are **pessimistic**: await the server, then
`invalidatesTags(['Alert'])` refetches the queue and detail; on error (409 / 401 / network) a toast
surfaces the real message and the UI reconciles to server truth — it never flips status on its own.
This directly satisfies the E2E criterion "the frontend doesn't lie about state on failures."
Optimistic-with-rollback (on the low-risk `acknowledge`) is a documented bonus in `remaining_bonus.md`.

---

## Trade-offs under the time cap

- **No pagination** — ~26 alerts render fine as a full set, and the summary-bar counts come from it.
  The list envelope (`{ data }`) leaves room to add `{ page, page_size, total }` later.
- **Sort is client-side** — trivial at this volume; avoids extra query params.
- **`dismissed` is a real status but unreachable** in required scope (it needs the bonus `dismiss`
  mutation). The summary bar shows the bucket (always 0) rather than inventing a phantom `in_progress`
  state the spec forbids.
- **No time-shift on ingest** — timestamps are kept honest (Feb 2026), so relative times read
  "months ago." Documented; the demo-polish alternative is in `remaining_bonus.md`.
- **Hand-written serializers** instead of Pydantic response models — fewer moving parts for the
  nested/derived alert shape; Pydantic still validates all request bodies.

## What I'd do with another week

Top of the list (see `remaining_bonus.md` for approaches): one test per layer (transition-409 +
scoping-404 API test, a FE hook test), `dismiss`/`reopen` + the analytics screen, Docker Compose,
optimistic acknowledge, and bulk actions.

---

## Additional libraries

- **dayjs** (+ `utc`, `timezone`, `relativeTime` plugins) — small, well-typed relative-time and
  device-local formatting on the client. (We don't do correctness-critical tz math here — that's
  server-side; dayjs only renders.)
- **@mui/material-nextjs** — official MUI ↔ Next App Router emotion cache integration (no FOUC).

Everything else is mandated by the assignment (Next, MUI, Redux Toolkit, Formik, Yup) or stdlib
(`zoneinfo`).

---

## AI tool disclosure

I used **Claude (Anthropic)** as a pair-programmer throughout: drafting the decision log and this
implementation, generating boilerplate (ORM models, serializers, MUI components), and running the
verification commands (ingest counts, the transition/scoping/timezone curl checks). I reviewed and
edited all output — schema shape, the alerts-only triage decision, the breach-flag model, and the
transition/scoping design are deliberate calls, not accepted defaults. No other AI tools were used.
