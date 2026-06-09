# Knaq Take-Home — Future Scope (Bonus & Deferred)

Everything here is **explicitly out of the current build scope**. The current scope is the required
must-/should-have slice locked in `notes.md`. These are the assignment's **Bonus** items (lines 306–319 of
`ASSIGNMENT.md`) plus a couple of undiscussed enhancements — captured now so the build stays focused and we
have a ready plan for "what I'd do next" (Submission §2, SOLUTION.md).

Order roughly follows the assignment's "rough order of value." Each entry records the **approach we'd take
when undertaken**, so picking it up later is a lookup, not a re-decision.

---

## Already satisfied by design (no extra work)

- **Out-of-order message handling** — on the Bonus list, but our design (notes **C5**) earns it for free:
  all reads `ORDER BY timestamp`, recovery↔alert matching compares timestamps, "latest" = `MAX(timestamp)`.
  Nothing to build; just state it in SOLUTION.md.

---

## Backend bonuses

### Pagination on list endpoints (from notes E1)
- **Approach:** offset/limit with an envelope `{ data, page, page_size, total }` on `/alerts` (and any
  other list). Default `page_size` ~25; cap it. Keep filters orthogonal to paging.
- **Why deferred:** only ~26 alerts; the queue + summary-bar counts work fine off the full set. Cursor
  paging is over-engineering at this volume.
- **Touch points:** `GET /alerts` query params `page`/`page_size`; the E3 list envelope already leaves room.

### `dismiss` / `reopen` mutations
- **Endpoints:** `POST /alerts/:id/dismiss`, `POST /alerts/:id/reopen`.
- **Transitions (extend the E2 `TRANSITIONS` map):** `new | acknowledged → dismissed`;
  `resolved | dismissed → reopened (→ acknowledged)`. Still server-enforced, still `409` on invalid.
- **Ripple:** the `dismissed` bucket (F4) becomes populated; Detail screen gains Dismiss / Reopen buttons
  (Screen 2 contextual actions). The state machine was written to slot these in without refactor.

### Bulk actions (API + UI)
- **API:** `POST /alerts/bulk/acknowledge`, `POST /alerts/bulk/assign` taking `{ ids: [...] , ... }`,
  returning per-id results (some may `409`).
- **UI fallback:** if API bulk isn't built, do it **client-side as fan-out** over the single-item
  mutations (assignment explicitly allows this). Queue multi-select checkboxes → bulk action bar.

### Daily aggregate stats endpoint
- **Endpoint:** `GET /devices/:id/stats` — avg / min / max / count **per reading type per local-tz day**.
- **Approach:** group the `readings` long table by `input_name` and by day **bucketed in the device's
  timezone** (reuse the D3 `zoneinfo` conversion — bucket on local date, not UTC date). Naturally falls out
  of the long-format reading rows (B2).

### Anomaly flagging (readings in-range but unusual vs. recent history)
- **Approach:** rolling mean / stddev (e.g. z-score over a trailing window) per `(device_id, input_name)`;
  flag outliers with a **separate** flag from `breached` (this is "weird but within threshold," distinct
  from "crossed threshold"). Surfaces in the same breaches/anomalies view.

---

## Frontend bonuses

### Optimistic UI updates with rollback (from notes F2)
- **Current scope is pessimistic** (await server → invalidate tags → reconcile on error).
- **When undertaken:** optimistic on the low-risk `acknowledge` (and maybe `assign`) via RTK Query
  `onQueryStarted` — patch the cache immediately, **roll back on server rejection** (e.g. 409). `resolve`
  stays pessimistic (large form, many fields). This is the cleanest demonstration of the Tips' "the UI must
  reconcile if the backend says no."

### Stretch analytics screen (from notes G4)
- **Endpoints:** add `GET /alerts/stats` (and maybe `GET /alerts/timeseries`).
- **Dashboard (ECharts):** MTTR, open count by severity, resolved-this-week vs last (trend), dismissal
  rate; **Alerts by Status** donut; **Resolution Time by Severity** bar with an SLA target line; **Alert
  Volume Trend** line over 7/30 days with severity series + area fill.
- **Note:** the "resolved this week / last 7 days" widgets read oddly against the raw Feb-2026 data (see the
  time-shift item below) — worth pairing.

### Keyboard shortcuts on the queue
- **Approach:** e.g. `A` = acknowledge selected, `J`/`K` = move selection. Scope to the queue view; respect
  focus (don't fire while typing in filters).

### Accessibility pass
- **Approach:** semantic roles on the table/list, focus management + focus trap on the Resolve/Assign
  dialogs, ESC-to-close, and contrast checks on status/severity badges against both themes.

---

## Infra / tooling bonuses

### Docker (`docker-compose up`) (from notes G2)
- **Approach:** `docker-compose.yml` with two services — `api` + `web`. SQLite lives as a **mounted file
  volume** (no separate db service needed). Highest-value bonus; do it last, after the must-have slice is
  polished.

### Tests (from notes G3)
- **Approach:** one meaningful test **per layer** — API integration test on the **status-transition 409**
  (+ company-scoping 404), and one FE hook/component test (filter hook or `AlertRow`). The assignment says
  coverage-as-a-number isn't graded, but one well-chosen test per layer is "a strong signal."

---

## Undiscussed enhancements (not on the Bonus list, but noted)

### Uniform ingest time-shift ("demo feels live") — alternative to F3
- **Idea:** shift **every** ingested timestamp by a fixed UTC delta so the latest message lands near "now."
  A constant delta preserves all intervals **and** keeps tz math correct (D3), so relative times and
  analytics trends look live without breaking correctness. Env-toggleable, documented in SOLUTION.md.
- **Why deferred:** current locked choice (F3) keeps raw timestamps for honesty; this is pure demo polish
  and only matters once the analytics screen exists.

### Postgres migration — alternative to A2 (SQLite)
- **When:** if we want a "real" DB service in Docker, or concurrency/time-series features.
- **Approach:** swap the SQLAlchemy URL SQLite → Postgres; schema is kept portable (A3) so it's a config
  change, not a rewrite. Add a `db` service to `docker-compose`.
