# Knaq Take-Home — Implementation Plan

Derived from the **LOCKED** decisions in `notes.md`. Scope = required must-/should-have slice only;
bonus work lives in `remaining_bonus.md`.

**Backend build principle (admin constraint): minimal code.** Lean, idiomatic FastAPI — ~10 files, **no**
service/repository class hierarchy, **no** custom abstractions where the framework already provides one.
Pydantic does validation, SQLAlchemy does persistence, FastAPI dependencies do auth + company-scoping.
A thin `scoped()` helper replaces a "repository layer." Every line should be defensible (Stage 1.3 is
graded on *explaining* the design, not on how much we wrote).

---

## 0. Repo scaffold (Phase 0)

```
your-submission/
  api/
    app/
      main.py          # app, CORS, startup ingest, router includes, error handlers
      config.py        # env: DATA_DIR, DB_URL, FE token seeds
      db.py            # engine, SessionLocal, Base, get_db dependency
      models.py        # ALL ORM models (one file — minimal)
      schemas.py       # ALL Pydantic request/response models (one file)
      auth.py          # HTTPBearer -> current_user dependency; scoped() helper
      ingest.py        # load JSON -> validate -> dedup -> flag -> insert (idempotent)
      seed.py          # seed users (5-6 across 3 companies) + load devices.json
      tz.py            # zoneinfo local<->UTC helpers
      transitions.py   # TRANSITIONS map + enforce()
      titles.py        # alert_type -> human title map
      routers/
        alerts.py      # list/detail + acknowledge/assign/resolve/notes
        devices.py     # list/detail/readings
        users.py       # list
    requirements.txt   # fastapi, uvicorn, sqlalchemy, pydantic, (no more than needed)
    .env.example
  web/                 # Next.js (Phase 2-3)
  data/
    devices.json
    sensor_messages.json
  README.md
  SOLUTION.md
  notes.md  remaining_bonus.md  IMPLEMENTATION_PLAN.md
```

**Step 0 tasks:** move `devices.json` + `sensor_messages.json` into `data/`; init `api/` venv; pin deps;
write `.env.example` (`DATA_DIR=../data`, `DB_URL=sqlite:///./knaq.db`).

---

## 1. The contract (do first — Tips: "data model on both sides")

The `alerts` row shape == the frontend `Alert` TS interface. Freeze it before building outward.

### Tables (SQLite via SQLAlchemy — decisions A2/A3, B0–B8, C3)

**devices** — loaded from `devices.json`
`device_id` (PK, str) · `type` · `company` (idx) · `name` · `location` · `timezone` ·
`floor_count` (null) · `installed_date` · `reading_types` (JSON) · `alert_thresholds` (JSON)

**users** — seeded (D1)
`id` (PK int) · `name` · `role` · `company` (idx) · `token` (unique)

**readings** — long format, one row per input sample (B2/B3/C4)
`id` (PK) · `device_id` (FK, idx) · `ts_utc` (datetime, idx) · `input_name` · `input_value` (float) ·
`breached` (bool) · `breach_kind` (null: `current_high`|`current_low`|`frequency_*`|`temperature_*`) ·
`threshold_value` (null float) · `unexpected_type` (bool) · `suspect` (bool)
→ **UNIQUE(device_id, ts_utc, input_name, input_value)** = dedup + idempotency (C2), index `(device_id, ts_utc)`.

**alerts** — the 26; triage state inline (B0/B4/B7)
`id` (PK) · `device_id` (FK) · `company` (denormalized for scoping, idx) · `ts_utc` · `alert_type` ·
`severity` · `threshold` (null) · `reading_value` (null) · `reading_name` (null) · `title` (derived) ·
`status` (`new`|`acknowledged`|`resolved`|`dismissed`, default `new`) · `assigned_to` (FK users, null) ·
`acknowledged_at` (null) · `resolved_at` (null) · `resolution_type` (null) · `resolution_root_cause` (null) ·
`resolution_action_taken` (null) · `resolution_preventive_measures` (null) · `resolution_time_spent_minutes` (null)
→ **UNIQUE(device_id, ts_utc, alert_type)** for dedup/idempotency.

**alert_events** — timeline audit (B5)
`id` (PK) · `alert_id` (FK, idx) · `ts` · `action` · `user_name` · `details` (null) · `note` (null)
→ ordered by `id`. Serializer nests as `timeline`.

**recoveries** — raw signal (B6)
`id` (PK) · `device_id` (FK) · `company` · `ts_utc` · `alert_type` · `severity` · `threshold`/`reading_value`/`reading_name` (null)

**rejected_messages** — malformed quarantine (C3)
`id` (PK) · `raw` (JSON text) · `reason` · `ts_ingested`

### Frontend `Alert` interface (mirror, strict TS — Phase 2)
`id, deviceId, deviceName, location, company, alertType, severity, title, threshold?, readingValue?,
readingName?, status, assignedTo?, acknowledgedAt?, resolvedAt?, resolution?{...}, timeline: TimelineEntry[]`.

---

## 2. Backend (Phase 1 — must-have)

Build in this order; each step is a few dozen lines.

1. **`db.py` + `models.py`** — engine, `Base`, `get_db`; all models above. SQLite `check_same_thread=False`.
2. **`seed.py`** — load `devices.json` into `devices`; insert 5–6 users across **Brookfield / Hines /
   Mitsui** with static tokens. The frontend's "current user" = a **Brookfield** user (most alerts → best demo).
3. **`tz.py`** — `to_utc(local_str, tzname)` and `to_local(dt_utc, tzname)` via `zoneinfo` (D3). Stdlib only.
4. **`titles.py`** — `{ "high_temperature": "High Temperature", "door_fault": "Door Fault", ... }` → `"<Label> — <device name>"`.
5. **`ingest.py`** — single pass over `sensor_messages.json` (C1/C5: order-independent):
   - Per message: validate shape → on failure append to `rejected_messages`, `continue` (never crash). Bad
     cases to expect: `message_type: null`, missing/`UNKNOWN-999` device, null `timestamp`, alert missing `severity`.
   - **Dedup** via the UNIQUE keys + `INSERT … ON CONFLICT DO NOTHING` (handles the 4 exact dupes; idempotent re-run).
   - `reading` → explode `inputs[]` into rows; for each numeric input, breach-check vs device thresholds
     (B3 mapping); set `breached`/`breach_kind`/`threshold_value`; mark `unexpected_type` if not in
     `reading_types` (skip breach-check); mark `suspect` for impossible values (e.g. negative current). `motor_status` never breach-checked.
   - `alert` → insert into `alerts` with derived `title`, `company` from device, `status='new'`; append one
     `alert_events` row `action='created'`.
   - `recovery` → insert into `recoveries`.
   - Run on startup **only if DB empty**; log counts (ingested / dupes dropped / rejected).
6. **`auth.py`** — `current_user` dependency (`HTTPBearer` → token lookup → `User` or **401**). `scoped(stmt, user)`
   helper appends `.where(Model.company == user.company)` — this *is* the multi-tenancy layer (D2). Cross-company detail → **404**.
7. **`transitions.py`** —
   ```py
   TRANSITIONS = {"acknowledge": {"new": "acknowledged"},
                  "resolve":     {"acknowledged": "resolved"}}
   # assign: allowed in any non-terminal status, no status change
   ```
   `enforce(action, current)` → new status or raise `HTTPException(409, ...)`. (Map leaves room for dismiss/reopen later.)
8. **`routers/alerts.py`**
   - `GET /alerts` — `scoped`; filters `severity, status[], device_id, assigned_to, q (title/device), from, to`;
     return `{ data: [...], counts_by_status: {...} }` (counts feed Screen 1; pagination deferred — E1/E3).
   - `GET /alerts/:id` — full alert + `timeline`; 404 if other company.
   - `POST /:id/acknowledge | /assign | /resolve | /notes` — `enforce`, mutate inline fields, append
     `alert_events` (record `user.name`), return the updated alert (B1). `assign` validates assignee in same company.
9. **`routers/devices.py`** — `GET /devices`, `GET /devices/:id` (scoped); `GET /devices/:id/readings?start&end`
   (**required** params; parse as device-local → UTC, query, return timestamps as device-local — D3).
10. **`routers/users.py`** — `GET /users` (scoped, for assignment).
11. **`main.py`** — app, permissive CORS for the web origin, include routers, exception handler emitting
    `{ error: { code, message } }` with right HTTP codes (401/404/409/422 — E3), startup → seed + ingest.

---

## 3. Frontend (Phases 2–3)

### Phase 2 — must-have
- **`lib/store`** — RTK store; **`features/alerts/api`** RTK Query base (`prepareHeaders` injects
  `NEXT_PUBLIC_API_TOKEN`; base URL from `NEXT_PUBLIC_API_BASE_URL`), tag types `['Alert','Device','User']` (F1).
- **`lib/theme`** — MUI light+dark `createTheme` with brand palette; provider + toggle persisted to
  `localStorage`, default from `prefers-color-scheme` (F5).
- **Screen 1 — Alert Queue** (`app/alerts`): summary bar (counts by status, clickable → filter, 4 real
  statuses, `dismissed` empty — F4); severity/device/status/search filters (client state in a `filters` slice);
  table rows (severity, title, device+building, **relative time + device-local tooltip — F3**, status badge,
  assignee, quick actions); sort; **loading skeleton / empty / error** states.
- **Screen 2 — Alert Detail** (`app/alerts/[id]`): header, metric card (reading vs threshold; graceful
  "device-detected fault, no metric" for the 13 non-threshold alerts), contextual action buttons by status,
  assignment section, **timeline** render, add-note form.
- Mutations are **pessimistic** (await → `invalidatesTags(['Alert'])` → reconcile on error — F2).

### Phase 3 — should-have
- **Screen 3 — Resolve dialog** (Formik+Yup): type/root_cause/action_taken required, preventive/time optional;
  inline validation after touch; submit disabled until valid.
- **Screen 4 — Assign dialog**: users list (initials avatar, name, role), highlight current, search, optional note.
- Filtering/search wired; theme toggle in chrome; **error UX** — surface 401 (bad token) / 409 (bad transition) /
  network; the UI never lies about state on failure (E2E criterion).

---

## 4. Docs & verify (Phase 4)
- **`README.md`** — run both services, env vars, seeded tokens/users for testing, exact commands.
- **`SOLUTION.md`** — storage + schema reasoning; dedup/malformed/breach-flag handling; where transition
  enforcement lives (`transitions.py`) + why; RTK Query vs slice split; server source-of-truth + pessimistic
  updates; trade-offs under time cap; what's next (point to `remaining_bonus.md`); **AI tool disclosure**.
- **Fresh-clone check**: wipe `knaq.db`, start api (ingest runs), start web, walk `new → acknowledged →
  resolved`; verify a `409` on an illegal transition, a `401` on a bad token, and tz-correct readings for
  `Asia/Tokyo` (ESC-001) / `Europe/London` (CMP-003).

---

## 5. Phase checklist (maps to the Prioritization Guide)

- [ ] **P0** scaffold + data moved + contract frozen
- [ ] **P1** BE: models · ingest(validate/dedup/flag/reject) · auth+scoping · `/alerts` list+detail · 4 mutations + state machine · `/devices` · `/devices/:id/readings` (tz) · `/users`
- [ ] **P2** FE: store+RTKQuery+theme · Queue · Detail (live, statuses reflected)
- [ ] **P3** FE: Resolve+Assign dialogs · notes+timeline · filters/search · theme toggle · error UX
- [ ] **P4** README · SOLUTION · fresh-clone verification

Bonus phases (Docker, tests, analytics, pagination, dismiss/reopen, bulk, optimistic, stats, a11y) → only
after P4, per `remaining_bonus.md`. **A polished must-have slice beats a half-finished everything.**
