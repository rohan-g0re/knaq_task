# Knaq Take-Home — Decision Log

This document enumerates **every decision** the assignment forces on us — from big
architectural calls down to small ones — and for each gives **3 options**, a
**recommended** one (✅), and the reasoning (citing `ASSIGNMENT.md` and general
good practice). We'll discuss each before locking it in.

---

## 0. Ground truth from the data (evidence behind the recommendations)

Ran an analysis pass over `devices.json` + `sensor_messages.json`:

- **816 messages**: `774 reading`, `26 alert`, `15 recovery`, **`1` with `message_type: null`**.
- **Malformed (~5 records total):** 1 null `timestamp`, 1 missing `device_id`, 1 unknown
  device (`UNKNOWN-999`), 1 alert missing `severity`, 1 null `message_type`.
- **Duplicates = exactly 4 extra copies**, and they are *fully exact* (same device + type +
  timestamp + payload). No "same timestamp, different value" collisions → dedup is unambiguous.
- **26 alerts** split: **13 carry** `threshold`/`reading_value`/`reading_name`
  (`high_temperature`, `speed_deviation`, `overcurrent`, `frequency_deviation`);
  **13 don't** (`vibration_anomaly`, `door_fault`).
- **Severities:** `warning` 27, `critical` 13 (+1 null). No `info`.
- **9 threshold-breaching readings**; **1 reading of an undeclared type** (ELV-002 reports
  `temperature`, which isn't in its `reading_types`). **84 `motor_status`** inputs.
- **3 companies** (Brookfield Properties 14 alerts, Hines 8, Mitsui Fudosan 4) and **6 timezones**
  (incl. `Asia/Tokyo`, `Europe/London`) → timezone correctness is genuinely tested.
- Window: **2026-02-10 → 2026-02-12** (~2.7 days). Messages are **not** in timestamp order
  → out-of-order handling (bonus) is real.

**Implication:** the dataset is small and mostly clean; the malformed/dup cases are a tiny,
deliberate handful designed to prove we handle them *gracefully* rather than at scale.

---

## A. Backend platform & storage

### A1. Backend language / framework — *architectural*

**What:** Language is "your choice." This anchors everything else (ORM, async, libs).

- choose Python + FastAPI

### A2. Database — *architectural*

**What:** Storage is "your choice … be prepared to defend the schema" (Stage 1.3, 25% weight).

✅ **SQLite**

### A3. Data-access layer — *design*

- ✅ **SQLAlchemy 2.0 (+ Pydantic for I/O)** — typed models, migrations-ready, swappable DB, clean repository layer for company-scoping.

## B. Data model (the core 25% — schema design)

### B0. **What is a "triageable alert"?** — *architectural (the pivotal decision)*

**What:** The assignment separates "Raw signal — readings, ingested **alerts**, recoveries" from
"Triage state — the human workflow layered on top of an **ingested alert**" (Stage 1.3). Separately,
"Readings that breach a threshold should be flagged — **stored separately, not discarded**" (Stage 1.2).
So: do threshold-breaching *readings* become triageable alerts, or only `message_type:"alert"` messages?

**Evidence (checked against the data):** **all 9 threshold-breaching readings are "silent"** — none has
an accompanying `alert` message (same device + reading_name, within 1h). So readings-above-threshold that
the device never alerted on *do exist*; they were deliberately seeded. Examples: `ELV-003 current=152–157`
(×6) vs `current_high=150` while its real `overcurrent` alert only fires at `173.22` (device hysteresis);
`CMP-001 temperature=132` vs `130` while its alerts fire at 135–146; `ELV-001 current=−5.2` (negative →
also a bad-sensor value) vs `current_low=5`. So Stage 1.2's "flag, don't discard" is **real, non-empty
work**, and this decision is live (not moot).

- ✅ **Only the 26 `message_type:"alert"` messages are triageable alerts.** Breaching readings get *flagged* and are queryable, but live as raw signal, not in the triage queue.
- Promote breaching readings into synthetic alerts too (queue would be 26 + ~9).
- Hybrid: alerts are triageable; breaches surface in a separate "anomalies" view, not the main queue.

**DECISION — LOCKED: Option 1.** The assignment treats "flagged readings" and "ingested alerts" as
**two different nouns** — breaches are "flagged … stored separately, **not discarded**" (i.e. don't lose
them), while triage state is layered specifically on "an **ingested alert**." Newly ingested alerts
"start in `status = new`" — readings have no status. This also matches the candidate's original instinct
("store outliers separately → pull alerts from the alert table directly"). It keeps the queue honest
(device-reported alerts) and the breach flag becomes the engine for the bonus "what's currently alerting
on this device?" query. Option 2 is defensible product-wise but contradicts the wording and muddies the
audit trail; if asked, that's our "with more time" extension.

**Clincher from the side-by-side (CMP-001 temperature):** an `alert` carries `alert_type` + `severity`
(what makes it *triageable*); a breaching `reading` carries neither. Promoting a breach would mean
*fabricating* a classification + severity policy, not ingesting data. And the 13 non-threshold alerts
(`door_fault`, `vibration_anomaly`) have no reading at all → alerts are their own signal, not a subset of
readings. **Storage consequence:** 2 core tables — `readings` (good **and** breaching, separated by a
`breached` flag) and `alerts` (the 26, triage state inline); recoveries as raw signal; timeline as its
own audit table. *Not* three tables for the three conceptual categories — flagged breaches are a view of
`readings`, not a separate store.

### B2. Readings storage shape — *design*

**What:** A reading message has an `inputs[]` array (e.g. current+frequency+temperature, or a lone motor_status).

- ✅ **Long/narrow: one row per sample** `(device_id, ts_utc, input_name, input_value, breached, …)`. Tidy time-series; per-reading-type aggregation (the stats bonus) is trivial; threshold flagging is per-value.

### B3. Threshold-breach flagging — where it lives — *design*

**What:** "Readings that breach a threshold should be flagged — stored separately, not discarded" (1.2).

- ✅ **`breached` boolean + nullable context columns** (`breach_kind`=`current_high`…, `threshold_value`) **on the readings row**, indexed. "Separate" = a flagged subset you can query, single source of truth.
- Dedicated `flagged_readings` table (literal reading of "stored separately").
- Compute breaches on the fly at query time (no stored flag).

**DECISION — LOCKED: Flag-on-row** (follows directly from B0). Because breaching readings stay *inside*
`readings` (a queryable view of readings, not a separate store), the flag lives on the row. It satisfies
"not discarded" + "queryable separately" (`WHERE breached = 1`) with no second table to sync, and powers
the "what's alerting on this device?" gap from the Context section. A dedicated `flagged_readings` table
only becomes worthwhile if we later promote breaches to triage items (B0 option 2) — explicitly out of
scope.

**Columns on the `readings` row (long format, per B2):** `breached` (bool), `breach_kind`
(`current_high` | `current_low` | `frequency_high` | `frequency_low` | `temperature_high` |
`temperature_low`, nullable), `threshold_value` (nullable). Index `(device_id, ts_utc)` plus a partial/
filtered use of `breached` for the "active breaches" query.

**Threshold mapping:** `current → current_low/high`, `frequency → frequency_low/high`,
`temperature → temperature_low/high`. `motor_status` is **never** breach-checked (it's a 0/1 state, has no
threshold). A reading of an **undeclared** type (e.g. ELV-002 `temperature`) is stored but **not**
breach-checked (no threshold applies → see C4). The lone negative value (`ELV-001 current=−5.2`) is
flagged `breached` (it's below `current_low`) **and** marked suspect — handled in C3, not lost.

### B4. Alerts + triage state — inline vs separate — *design*

**What:** Stage 1.3 lists the triage fields and says "you may model these inline or in a separate table — your call."

- ✅ **Inline on the `alerts` table** (`status`, `assigned_to`, `acknowledged_at`, `resolved_at`, `resolution_type`, `resolution_*`). It's strictly 1:1 with an alert.
- Separate `triage` table (1:1 FK) — cleaner "raw vs human" separation, but a join for every read with no real payoff at 1:1.
- Separate table **with history rows** — overkill; the timeline already captures history.

**DECISION — LOCKED:** Inline. The relationship is 1:1 and the resolution fields only exist once per alert,
so a separate table adds a join for zero normalization benefit. The "raw vs triage" conceptual split the
assignment cares about is already honored by keeping **readings** separate from **alerts**; the human
fields riding on the alert row is the simplest correct model.

### B5. Timeline storage — *design*

**What:** Each alert has a `timeline`: ordered `{timestamp, action, user, details, note?}`; starts with one `created` entry (1.3).

- ✅ **Separate `alert_events` table** (one append-only row per entry, ordered by ts). True audit trail; easy to append on each mutation; never rewrites the alert row.
- JSON array column on the alert — simplest, one read, but every append is a read-modify-write of the whole array.
- Derive timeline from a generic mutation/event log — most "event-sourced," but more machinery than the time cap warrants.

**DECISION — LOCKED:** Separate `alert_events` table. The assignment repeatedly stresses the **audit trail**
("a clear audit trail," Context + Screen 2 timeline). An append-only table is the natural, defensible
audit structure and avoids concurrent read-modify-write races on a JSON blob. Serializer nests it into
the alert response as `timeline`. (JSON column is the acceptable shortcut if we get time-pressured.)

### B6. Recoveries — what do we do with them? — *design*

**What:** 15 recovery messages; listed under "raw signal." They reference `alert_type`/`device`/`severity`.

- ✅ **Store as raw signal; correlate to the matching open alert for *display* only** (show "device reported recovery at …" as context on the alert detail / metric card). Humans still resolve.
- Auto-resolve the matching open alert when a recovery arrives.
- Store and otherwise ignore.

**DECISION — LOCKED:** Store + display-correlate. The triage flow is explicitly **human-driven**
(`new → acknowledged → resolved` with a person capturing `resolution_type`/`root_cause`). Auto-resolving
would bypass that captured-by-a-user workflow and the `resolved_at`/`resolution_*` fields the UI collects
(Screen 3). So recoveries are context that *helps* the human decide, not an automatic state change.
Correlation key: same `device_id` + `alert_type`, recovery `timestamp` after the alert.

### B7. Alert `title` / description — *small*

**What:** Frontend shows an "alert title" and supports `q` search on "title/device" (§1.5, Screen 1) — but the data has no title.

- ✅ **Derive a human title at ingest from `alert_type` + device name** (e.g. "High Temperature — HVAC Compressor Unit A"); store it so search/sort is a plain column.
- Compute the title only in the serializer (don't store) — keeps DB lean, but `q` search must filter in app code.
- Store a raw `alert_type` slug only; let the frontend prettify.

**DECISION — LOCKED:** Derive-and-store. The `q` filter searches title, so having it as an indexed column
keeps search server-side and simple, and the Tips say mock-generated text should "feel real … derived
from real threshold breaches." A small title-builder maps the 6 alert types to friendly labels.

### B8. Primary keys / IDs — *small*

**What:** Messages have **no ID**; alerts are addressed by `:id` in URLs and mutated.

- ✅ **Integer autoincrement PKs** for all tables — simplest, readable in dev/logs, fine for this scale.
- UUIDs for alerts — non-enumerable, more "production," but noisier URLs and overkill here.
- Natural composite keys — brittle given dup/malformed data.

**DECISION — LOCKED:** Autoincrement integers. At this scale enumeration isn't a real threat and integer
IDs keep URLs and debugging clean. Note UUID-for-alerts as the trivial production hardening.

---

## C. Ingestion & validation (the "graceful handling" 25%)

### C1. How messages get into the DB — *design*

- ✅ **Idempotent seed/ingest routine run at startup (and as a CLI/`make seed`)** that reads `data/*.json`, validates, dedups, writes, and logs rejects. Re-runnable without dupes.
- A `POST /ingest` endpoint — nice for "real" ingestion, but not asked for and adds surface area.
- Lazy ingest on first API request — hidden side effects, hard to test.

**DECISION — LOCKED:** Idempotent startup/CLI ingest. The assignment frames ingestion as a batch over a
provided file ("Read all messages from `data/sensor_messages.json`"), and idempotency means a fresh clone

+ restart always yields the same DB (Submission §3). The same function is reused by integration tests.

### C2. Duplicate definition — *design* (resolves "no duplicates" in the original notes)

**What:** "Detect and handle duplicate messages (no message ID — you decide what constitutes a duplicate)" (1.2).

- ✅ **Exact-content dedup:** key = hash of `(device_id, message_type, timestamp, sorted inputs / alert fields)`. First wins; later exact copies dropped (and counted/logged).
- `(device_id, message_type, timestamp)` only — treats same-instant different-value as dup (risky).
- No dedup — violates 1.2.

**DECISION — LOCKED:** Exact-content key. The data backs this precisely: the only duplicates present are **4
fully-exact copies**, with **zero** "same device+type+timestamp but different payload" collisions — so a
content hash is both correct and safe (it won't wrongly merge two distinct readings that happen to share a
timestamp). We persist the dedup key with a UNIQUE constraint so re-ingest (C1) stays idempotent.

### C3. Malformed-message handling — *design*

**What:** "Handle malformed or incomplete messages gracefully — log them, don't crash" (1.1); validate required alert fields (1.2).

- ✅ **Validate per message; on failure, write to a `rejected_messages` table** (raw payload + reason) **and log; skip; never crash.**
- Log to stderr only and skip (no persistence).
- Best-effort coerce/repair (e.g. guess missing fields).

**DECISION — LOCKED:** Reject-table + log. With ~5 bad records (null timestamp, missing/unknown device,
null `message_type`, missing `severity`), a small `rejected_messages` table is cheap and is **concrete,
queryable evidence** for the "handles malformed records" criterion — far stronger than a log line that
scrolls away. Coercion is wrong here: the bad records are meant to be quarantined, not guessed.

### C4. Reading-type validation — *small*

**What:** "Validate readings match the device's expected `reading_types`" (1.2). Data has 1 offender (ELV-002 → `temperature`).

- ✅ **Store the reading but flag `unexpected_type=true`** (and skip threshold-checking it). Don't lose data; surface the anomaly.

**DECISION — LOCKED: Store-and-flag.** Mirrors the breach-flag philosophy ("flag, don't discard"): the
one offender (ELV-002 reporting `temperature`, not in its `reading_types`) is stored with
`unexpected_type=true` and **not** threshold-checked (no threshold applies to a type the device shouldn't
report). Keeps an otherwise-valid multi-input reading intact instead of rejecting the whole message.

### C5. Out-of-order messages (bonus) — *small*

**What:** Data is **not** timestamp-sorted; bonus lists "Out-of-order message handling."

- ✅ **Order-independent ingest:** sort/treat by `timestamp`, not arrival; reads always `ORDER BY ts`. Out-of-order is then a non-issue by construction.
- Explicitly buffer/reorder on ingest.
- Ignore ordering.

**DECISION — LOCKED: Order-independent by construction — no special code.** "Out-of-order handling" is a
*streaming* concern (systems that treat arrival order as time order). We ingest a batch from JSON, so the
correct stance is simply to **never introduce an order dependency**: store the event `timestamp` and make
every order-sensitive operation key off it. Concretely:

- All reads `ORDER BY timestamp` — **never `ORDER BY id`** (PKs are autoincrement per B8, and the file is
  genuinely unsorted, so insertion order ≠ time order).
- Recovery↔alert matching (B6) compares **timestamps**, not "last inserted."
- "Latest reading / current state" = `MAX(timestamp)`, not last row written.

We write **zero** buffering/reordering logic and still satisfy the bonus *for free*, because the design
has no order dependency to begin with. State this explicitly in SOLUTION.md.

---

## D. Auth, multi-tenancy & timezones

### D1. Auth mechanism — *design*

**What:** "Requests carry a bearer token … resolves to a user with a `company` and `name`/`role` … hardcoded users, signed JWT, or simple lookup table — just show the wiring works" (1.4).

- ✅ **Seeded token→user lookup table** (static bearer tokens in the DB/seed).
- Signed JWT (HS256) — more "real," but key handling + nothing here needs statelessness.
- Session cookies — wrong shape; the spec says bearer token.

**DECISION — LOCKED (required):** Token→user lookup. The assignment explicitly green-lights it and says the point is
just to "show the wiring works." It's the least code for full marks; JWT is the documented upgrade.
Seed **5–6 users across the 3 real companies** (Brookfield/Hines/Mitsui), pick one Brookfield user as the
frontend's "current user" (Brookfield has the most alerts → liveliest demo).

### D2. Multi-tenancy enforcement — *architectural*

**What:** "All list endpoints must filter to the requesting user's company" (1.4); correctness graded on "company-scoped data" (25%).

- ✅ **Auth dependency resolves token→user→company; a repository layer applies the `company` filter to every query.** Centralized, hard to forget.
- Filter ad-hoc in each route handler.
- DB row-level security — not worth it for SQLite/this scope.

**DECISION — LOCKED (required):** Dependency + repository filter. Centralizing the scope in one place is the difference
between "company-scoped" being a guarantee vs a thing you hope every endpoint remembered. Devices are
company-owned, so alerts/readings inherit scope via their device. Cross-company access → **404** (don't
reveal existence) for detail routes.

### D3. Timezone handling — *architectural (explicit correctness call)*

**What:** Timestamps are "epoch ms (UTC)"; `/devices/:id/readings` takes `start`/`end` in **device local tz** and returns timestamps in **device local tz** (§1.5). Tips: "Timezones matter … handle it properly server-side."

- ✅ **Store UTC; convert at the edges using stdlib `zoneinfo`.** Parse `start`/`end` as device-local → UTC for the query; format response timestamps as device-local ISO-8601 with offset.
- Store local time — corrupts ordering/dedup across tz; never do this.
- Convert in the frontend — explicitly forbidden by the Tips ("Don't fudge it with `toLocaleString()`").

**DECISION — LOCKED (required):** UTC-store + `zoneinfo` edge conversion. This is called out as "a real correctness
call" and is genuinely exercised — 6 timezones including `Asia/Tokyo` and `Europe/London`. `zoneinfo` is
stdlib (no dep) and DST-correct. The device's `timezone` field is the per-device key for conversion.

---

## E. REST API surface

### E1. Pagination — *small (bonus-adjacent)*

**What:** `/alerts` filters listed; "Pagination optional but recommended" (§1.5); bonus: "Pagination on list endpoints."

- ✅ **Offset/limit with an envelope** `{ data, page, page_size, total }`.
- Keyset/cursor — scales better, unnecessary at ~26 alerts.
- None — leaves an easy bonus + summary-bar counts on the table.

**⏸ BONUS — deferred (not in current scope).** Pagination is on the assignment's Bonus list. In current
scope `/alerts` returns the full company-scoped, filtered set (~26 alerts), which the queue renders
directly and the summary bar counts from — no pagination needed. Recommended approach (offset/limit
envelope) is recorded in `remaining_bonus.md`.

### E2. Status-transition enforcement — where — *architectural*

**What:** "enforce status transitions server-side … Invalid transitions return 409 Conflict with a clear error" (§1.5); "Server is the source of truth" (Tips).

- ✅ **A single state-machine map in a service layer**, called by every mutation; invalid → `409` with a descriptive body. UI buttons are a *hint*, server decides.
- Enforce inside each route handler — duplicated rules, easy to drift.
- Enforce in the frontend — explicitly wrong ("backend is the source of truth").

**DECISION — LOCKED (required):** Central state machine. One `TRANSITIONS` map encoding the **required
paths only** — `new → acknowledged`, `acknowledged → resolved`, and `assign` allowed in any non-terminal
status without changing `status` — called by every mutation; invalid → `409` with a descriptive body.
(`dismiss`/`reopen` transitions are bonus → `remaining_bonus.md`; the map is written so they slot in later
without a refactor.) SOLUTION.md asks specifically "where you put status-transition enforcement and why" —
a named service layer is the clean answer.

### E3. Response/error conventions — *small*

- ✅ **Bare object for detail, enveloped list for collections; consistent error body** `{ error: { code, message } }` with correct HTTP codes (401 bad token, 403/404 cross-company, 404 missing, 409 bad transition, 422 validation).
- JSON:API everywhere — heavy, not expected.
- Ad-hoc shapes per endpoint — fails "reasonable HTTP semantics."

**DECISION — LOCKED (required):** Detail returns a bare object; list returns `{ data: [...] }` (the
summary-bar status counts are computed from the full company-scoped set, since pagination is deferred).
Consistent error body `{ error: { code, message } }` with correct codes: **401** bad token, **404**
missing / cross-company (don't reveal existence), **409** bad transition, **422** validation. Pagination
fields (`page`/`page_size`/`total`) get added with the pagination bonus (`remaining_bonus.md`). The rubric
rewards "Reasonable HTTP semantics and error responses"; the E2E criterion names "409 on bad transitions,
401 on bad token."

---

## F. Frontend (stack is fixed; the calls are about *structure*)

> Stack is mandated: Next.js 14+ App Router, **strict** TS (no `any`), MUI v5+,
> Redux Toolkit (RTK Query encouraged), Formik+Yup, ECharts (only for analytics stretch),
> **live API, no mock data**. So decisions here are about organization, not library choice.

### F1. Server-state vs client-state split — *architectural*

**What:** Graded: "Sensible split between server state (RTK Query / cache) and client state (filters, selection)" (Frontend 15%).

- ✅ **RTK Query owns all server data** (alerts, detail, devices, users, readings, stats) with **tag-based invalidation**; **Redux slices own UI-only state** (filters, multi-select, theme).
- Put everything in slices + manual thunks — re-implements caching RTK Query gives free.
- Server state in React Query, client in Redux — mixing two cache libs, against the mandated stack.

**DECISION — LOCKED (required):** RTK Query for server, slices for UI. This is almost verbatim what the rubric and the
suggested folder layout (`api/` vs `slices/`) describe. Mutations `invalidatesTags(['Alert'])` so the
queue + detail refetch consistently after a transition.

### F2. Optimistic vs pessimistic updates — *design (bonus)*

**What:** Tips: "frontend can show optimistic transitions, but the backend enforces … If the backend says no, the UI must reconcile." Bonus: "Optimistic UI updates that correctly roll back on server rejection."

- ✅ **Pessimistic by default; optimistic on the low-risk `acknowledge` (and `assign`) with rollback** via RTK Query `onQueryStarted`.
- Fully optimistic everywhere — risky for `resolve` (a big form) and easy to get reconciliation wrong.
- Fully pessimistic — safe, but leaves the optimistic bonus on the table and feels laggy on one-click acks.

**DECISION — LOCKED (required = pessimistic):** Pessimistic updates only — every mutation awaits the
server, then RTK Query `invalidatesTags(['Alert'])` refetches; on error (409 / 401 / network) the UI
surfaces it and reconciles to server truth. This directly satisfies the E2E criterion "the frontend
doesn't lie about state on failures." **Optimistic UI with rollback is a Bonus → `remaining_bonus.md`**
(recommended target when undertaken: optimistic on the low-risk `acknowledge`).

### F3. "Now" reference for relative time — *product/design (subtle but real)*

**What:** Screen 1 shows "triggered time (relative — '5m ago')," but the dataset is **Feb 2026** while today is ~Jun 2026 → everything would read "≈4 months ago," and the analytics "resolved this week / last 7 days" would be empty.

- ✅ **Apply a uniform forward time-shift at ingest** (configurable env, default on) so the latest message lands near "now"; a *fixed UTC delta preserves all intervals and keeps tz math correct*. Document it.
- Keep raw timestamps; render true relative time + absolute device-local time in a tooltip.
- Hard-code a "demo now" only in the frontend clock — but then BE timestamps and FE clock disagree.

**DECISION — LOCKED (required; best-practice = keep data honest):** Keep raw timestamps; render true
relative time ("117d ago") with the absolute **device-local** time on a tooltip / secondary line. We do
**not** mutate ingested timestamps — that keeps the timezone-correctness story (D3) clean and avoids
fudging the data. The "everything is months ago" cosmetic only really bites the analytics trends, which
are a deferred bonus anyway. The optional uniform-time-shift "demo polish" is recorded in
`remaining_bonus.md` as future scope.

### F4. Status taxonomy mismatch in the UI — *small (spec inconsistency to resolve)*

**What:** Screen 1's summary bar lists "New, Acknowledged, **In Progress**, Resolved, Dismissed," but §1.5 states "there is **no separate `in_progress` state**" — acknowledged *is* the working state.

- ✅ **Use the 4 real statuses** (`new`, `acknowledged`, `resolved`, `dismissed`); label "Acknowledged" as the in-progress/working bucket. No phantom state.
- Add a real `in_progress` status — contradicts the backend rules.
- Omit dismissed from the bar — but it's a real (bonus) state.

**DECISION — LOCKED (required):** Four real statuses (`new`, `acknowledged`, `resolved`, `dismissed`);
"Acknowledged" is the working bucket — no phantom `in_progress` (§1.5 forbids it). In current scope only
`new → acknowledged → resolved` is reachable; `dismissed` renders as a bucket but stays empty until the
bonus `dismiss` mutation (`remaining_bonus.md`). Documented as an assumption per Tips.

### F5. Theme (dark/light) — *small*

- ✅ **`createTheme` light+dark with the brand palette; toggle in the app chrome; persist to `localStorage`; default from `prefers-color-scheme`.**
- Light only — misses a required item ("Dark + light mode … Toggle reachable from the UI chrome").
- CSS-variable theming outside MUI — fights the mandated MUI theming.

**DECISION — LOCKED (required):** MUI dual theme with the given brand colors (primary `#EFC01A`, secondary `#4B8189`,
plus the status colors). It's explicitly required and the status/severity colors must stay consistent
across the queue, badges, and charts.

### F6. Repo / app structure — *small*

- ✅ **Feature-based layout exactly as suggested** (`features/alerts/{api,components,hooks,types,slices}`, `lib/{store,theme,auth}`).
- Layer-based (`components/`, `services/`, `pages/`) — graded lower; rubric explicitly wants "feature-based structure."
- Flat — won't scale across 4 screens.

**DECISION — LOCKED (required):** Follow the suggested feature-based tree. The rubric literally rewards "Clean
feature-based structure," and the assignment hands us the layout — matching it is free signal.

---

## G. Cross-cutting & bonuses

### G1. Monorepo wiring — *small*

- ✅ **Two plain folders `api/` + `web/`, root `README.md` + `SOLUTION.md` + `docker-compose.yml`.** Web reads `NEXT_PUBLIC_API_BASE_URL` + a bearer token from env.
- npm/Turbo workspaces — pointless when `api` is Python.
- Two separate repos — violates "two services live in one repo."

**DECISION — LOCKED (required):** Two-folder single repo (`api/` + `web/`) with `README.md` +
`SOLUTION.md` at root. (The `docker-compose.yml` shown in the layout belongs to the Docker bonus →
`remaining_bonus.md`.) Frontend ships "a configurable API base URL (env var) and a hardcoded or
env-supplied bearer token" (Part 2).

### G2. Docker (bonus) — *small*

- ✅ **`docker-compose` with `api` + `web`** (SQLite as a mounted file volume; no separate db service).
- Compose with a Postgres service too — only if we adopt Postgres (A2).
- Skip Docker — it's the **top-listed bonus** ("rough order of value").

**⏸ BONUS — deferred (not in current scope).** Recommended approach recorded in `remaining_bonus.md`.

### G3. Tests (bonus) — *small*

- ✅ **One meaningful test per layer:** API integration test on the **status-transition 409** (and company-scoping), + one FE hook/component test (e.g. the filter hook or an `AlertRow`).
- Broad coverage — not what's graded ("Test coverage as a number" is explicitly *not* evaluated).
- No tests — misses "a strong signal" and an easy bonus.

**⏸ BONUS — deferred (not in current scope).** Recommended approach recorded in `remaining_bonus.md`.

### G4. Analytics stretch (bonus) — *scope*

- ✅ **Defer; do only if must+should are polished.** If reached: add `GET /alerts/stats` (+ maybe `/timeseries`) and the ECharts dashboard (MTTR, status donut, resolution-time-by-severity with SLA line, volume trend).
- Build it early — risks an over-scoped, half-finished submission.
- Skip entirely — fine; it's explicitly stretch.

**⏸ BONUS — deferred (not in current scope).** Recommended approach (incl. `GET /alerts/stats` /
`/timeseries`) recorded in `remaining_bonus.md`.

## H. Status — all blocking decisions resolved

All four prior open questions are now **LOCKED**: **B0** (alerts-only triage queue; breaches flagged, not
promoted), **F3** (keep raw timestamps + device-local tooltip — no time-shift), **B5** (separate
`alert_events` audit table), **A2** (SQLite). Every **required-scope** decision across A–G is locked
above. Bonus / out-of-scope items live in **`remaining_bonus.md`** as future scope.

### Current scope — tables to build
`devices` · `users` · `readings` (long format + `breached`/`unexpected_type`/suspect flags) ·
`alerts` (triage state inline) · `alert_events` (timeline audit) · `rejected_messages` · recoveries (raw
signal). Required endpoints: `GET /alerts`, `GET /alerts/:id`, `GET /devices`, `GET /devices/:id`,
`GET /devices/:id/readings`, `GET /users`, + mutations `acknowledge` / `assign` / `resolve` / `notes`.
