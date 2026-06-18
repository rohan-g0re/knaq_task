# learning.md — Knaq codebase study guide

Caveman mode. No fluff. Each bullet = one thing to go look at and be able to explain. Walk top to bottom. Open the file named in the heading, read the lines, tick the bullet.

Stack in one breath: FastAPI + SQLAlchemy + SQLite (backend) ⇄ HTTP ⇄ Next.js 14 App Router + TypeScript + Redux Toolkit + RTK Query + MUI + Formik/Yup + ECharts (frontend).

---

## PART 0 — ORIENTATION (do first, 10 min)

### 0.1 Repo layout

- `api/` = backend. `web/` = frontend. `data/` = `devices.json` + `sensor_messages.json` (fixtures).
- backend entry: `api/app/main.py` → object `app`.
- frontend entry: `web/src/app/layout.tsx` → `app/page.tsx` redirects to `/alerts`.
- run backend: `uvicorn app.main:app` (from `api/`, port 8000).
- run frontend: `npm run dev` (from `web/`, port 3000).

### 0.2 The contract (memorize the shape)

- DB stores all timestamps as **naive UTC**.
- API returns JSON in **camelCase** (manual serializers, not auto).
- alerts/events timestamps → UTC `Z` string. readings timestamps → device-local ISO with offset.
- every list endpoint is **company-scoped** by the bearer token's user.

### 0.3 End-to-end request lifecycle (be able to narrate this cold)

1. User clicks "Acknowledge" in browser.
2. RTK Query mutation fires → `knaqApi` `baseQuery` attaches `Authorization: Bearer <token>` from `session` slice.
3. `POST /alerts/:id/acknowledge` hits FastAPI.
4. `Depends(current_user)` resolves token → `User`. `Depends(get_db)` opens DB session.
5. route loads alert, checks company, calls `enforce("acknowledge", status)` (state machine), writes, appends `AlertEvent`, commits.
6. returns `serialize_alert(..., with_timeline=True)`.
7. mutation `invalidatesTags` → RTK Query refetches queue + detail → UI updates.
8. toast shows success/error.

### 0.4 Startup flow (`api/app/main.py:30-42`)

- `@app.on_event("startup")` → `Base.metadata.create_all(engine)` makes tables.
- if DB empty: `seed(db)` (devices + 6 users) then `run_ingest(db)` (readings/alerts/recoveries + anomalies).
- idempotent: skips if devices already exist.

---

## PART 1 — BACKEND, FILE BY FILE

Each file: read it, then answer "what does every line group do" and "which FastAPI principle is shown here."

### 1.1 `api/app/config.py` — config/env

- `API_DIR`, `REPO_DIR` = path math off `__file__`.
- `DATA_DIR` = `os.getenv("DATA_DIR", REPO_DIR/"data")`.
- `DB_URL` = `os.getenv("DB_URL", "sqlite:///./knaq.db")`.
- `WEB_ORIGIN` = `os.getenv("WEB_ORIGIN", "http://localhost:3000")` — used for CORS.
- principle: **12-factor config via env vars with defaults**. No secrets in code.

### 1.2 `api/app/db.py` — SQLAlchemy engine + session

- `engine = create_engine(DB_URL, connect_args=...)`. `check_same_thread=False` only for SQLite (FastAPI is multi-threaded; SQLite blocks cross-thread by default).
- `SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)`.
  - know why `expire_on_commit=False`: so ORM objects stay usable after `commit()` (serializers read them post-commit).
- `Base = declarative_base()` — parent of every model.
- `get_db()` generator: `yield db` then `finally: db.close()`.
- principle: **dependency injection** — `get_db` is wired in via `Depends(get_db)`; route gets a fresh session, auto-closed.

### 1.3 `api/app/models.py` — ORM models = DB schema (read all 7)

For each model know: table name, PK, indexed cols, FKs, JSON cols, constraints.

- **Device** (`devices`): PK `device_id` (string). `company` indexed. `reading_types`/`alert_thresholds` = JSON columns. `floor_count` nullable.
- **User** (`users`): PK `id` int. `token` unique+indexed (auth lookup). `company` indexed.
- **Reading** (`readings`): PK id. FK `device_id`. `ts_utc` indexed. cols `input_name`, `input_value`. quality flags `breached`, `breach_kind`, `threshold_value`, `unexpected_type`, `suspect`, `anomaly`.
  - **UniqueConstraint** `(device_id, ts_utc, input_name, input_value)` = dedup key.
  - **composite index** `(device_id, ts_utc)` = fast time-range query.
- **Alert** (`alerts`): the triage object. `company` **denormalized** here (so list queries scope without joining devices). status machine col `status` default `"new"`. resolution cols (`resolution_type`, `resolution_root_cause`, etc.). `assigned_to` FK→User nullable. `acknowledged_at`/`resolved_at`.
  - `relationship()`: `device`, `assignee`, `events` (one-to-many, cascade delete).
  - UniqueConstraint `(device_id, ts_utc, alert_type)` = alert dedup.
- **AlertEvent** (`alert_events`): audit/timeline row. `action`, `user_name`, `details`, `note`, `ts`.
- **Recovery** (`recoveries`): immutable log of "condition returned to normal."
- **RejectedMessage** (`rejected_messages`): bad ingest rows (`raw`, `reason`).
- principles: **denormalization for query speed** (`Alert.company`), **DB-level dedup via unique constraints**, **indexes match query patterns**, **JSON column for schemaless config**.

### 1.4 `api/app/auth.py` — bearer auth + multi-tenancy (THIS FILE IS OPEN — know it cold)

- `bearer = HTTPBearer(auto_error=False)` — pulls token from `Authorization` header; `auto_error=False` so WE return the 401, not the framework.
- `current_user(creds=Depends(bearer), db=Depends(get_db)) -> User`:
  - no creds → `HTTPException(401, "Missing bearer token.")`.
  - `db.query(User).filter(User.token == creds.credentials).first()`.
  - no match → `401 "Invalid bearer token."`. else return User.
  - principle: **chained dependencies** (`current_user` itself depends on `bearer` + `get_db`).
- `scoped(stmt, model, user)`: returns `stmt.where(model.company == user.company)`.
  - principle: **multi-tenancy by default** — one helper, applied to every list query, so company isolation can't be forgotten per-field.

### 1.5 `api/app/transitions.py` — status state machine

- `TRANSITIONS` dict: `acknowledge {new→acknowledged}`, `resolve {acknowledged→resolved}`, `dismiss {new/acknowledged→dismissed}`, `reopen {resolved/dismissed→acknowledged}`.
- `TERMINAL = {"resolved", "dismissed"}` — can't assign these.
- `enforce(action, current) -> new_status`: looks up allowed map; if `current` not a valid source → `HTTPException(409, ...)`.
- principle: **server is source of truth for state**; invalid transition = **409 Conflict**.

### 1.6 `api/app/titles.py` — derived display titles

- `LABELS` maps `alert_type` → pretty label.
- `build_title(alert_type, device_name)` → `"High Temperature — Compressor-01"` (em-dash `DASH`).
- called once at ingest; title is **immutable** after.

### 1.7 `api/app/tz.py` — timezone math (high-value, they WILL ask)

- `from_epoch_ms(ms)` → naive UTC datetime. used on ingest (epoch ms in fixtures).
- `local_to_utc(value, tzname)` → parse local ISO, attach ZoneInfo, convert to naive UTC. used on `/readings` query params.
- `utc_to_local_iso(dt, tzname)` → naive UTC → local ISO with offset. used serializing readings.
- `utc_iso(dt)` → naive UTC → `...Z` string. used serializing alerts/events.
- `utc_to_local_date(dt, tzname)` → `"YYYY-MM-DD"` in local tz. used bucketing daily stats.
- principle: **store UTC, convert at the edges**; never `toLocaleString` on the frontend.

### 1.8 `api/app/ingest.py` — ingest + validation + anomaly detection

- consts: `VALID_TYPES = {reading, alert, recovery}`; `CHECKED_INPUTS = {current, frequency, temperature}` (motor_status excluded).
- `_breach(input_name, value, thresholds)` → checks `{name}_high`/`{name}_low` keys → `(breached, breach_kind, threshold_value)`.
- `run_ingest(db)`:
  - load devices, read `sensor_messages.json`.
  - validate each msg: type in VALID_TYPES, has timestamp + device_id → else log to `RejectedMessage`.
  - reading branch: parse `inputs[]`; per input compute `unexpected_type`, breach, `suspect` (negative current); dedup via `sqlite_insert(...).on_conflict_do_nothing()`; count readings/duplicates.
  - alert branch: require `alert_type`+`severity`; `build_title`; status `new`; append `AlertEvent("created")`; unique `(device_id, ts_utc, alert_type)`.
  - recovery branch: write immutable `Recovery` row.
  - commit, then `flag_anomalies(db)`.
- `flag_anomalies(db)`: rolling-window z-score per `(device_id, input_name)`, window ~20, flag when `|x-mean| > 2.5*std` and ≥10 history → set `reading.anomaly`.
- principles: **fail soft** (log bad rows, never crash), **idempotent dedup via DB constraint not exceptions**, **separate raw signal from triage state**.

### 1.9 `api/app/seed.py` — seed users + devices

- `USERS`: 6 users, 3 companies (Brookfield: Alice/Bob, Hines: Carol/Dan, Mitsui: Emi/Frank). each has `token`.
- `seed(db)`: load `devices.json` → add devices + users → commit.
- KNOW THE TEST TOKENS: e.g. `brookfield-alice-token`, `hines-carol-token` (check file for exact strings).

### 1.10 `api/app/schemas.py` — Pydantic bodies + serializers

- **Pydantic request models** (validation happens before your code runs):
  - `AssignBody {assignee_id:int, note?:str}`.
  - `ResolveBody {resolution_type:ResolutionType, root_cause:str(min1), action_taken:str(min1), preventive_measures?, time_spent_minutes?(ge=0)}`.
  - `NoteBody {note:str(min1)}`. `BulkIds {ids:list[int] min1}`. `BulkAssignBody` extends BulkIds.
  - `ResolutionType = Literal[...]` — invalid value → auto 422.
- **serializers** (ORM → camelCase dict): `user_brief`, `serialize_event`, `serialize_alert(a, with_timeline=False)`, `serialize_device`, `serialize_reading(r, tzname)`.
- principle: **Pydantic = boundary validation**; `Field(min_length=, ge=)` = declarative constraints; **manual serializers** keep snake→camel mapping explicit.

### 1.11 `api/app/main.py` — app wiring

- `app = FastAPI(title="Knaq Alert Triage API")`.
- `CORSMiddleware` with `allow_origins=[WEB_ORIGIN]` — why CORS exists (browser blocks cross-origin without it).
- `@app.on_event("startup")` (see 0.4).
- two `@app.exception_handler(...)`: `HTTPException` → `{"error":{"code","message"}}`; `RequestValidationError` → 422 + details. principle: **uniform error envelope**.
- `@app.get("/health")` → `{"ok":True}`.
- `include_router(alerts/devices/users)`.

### 1.12 `api/app/routers/alerts.py` — the big one (read every route)

- `router = APIRouter(prefix="/alerts", tags=["alerts"])`.
- sort exprs: `SEV_ORDER`/`STATUS_ORDER` via SQLAlchemy `case(...)`; `SORTS` dict.
- helpers: `_parse_dt` (ISO→naive UTC), `_get_alert` (load + company check → 404), `_log` (append AlertEvent in-memory).
- `GET /alerts` (`:46`): the meaty one.
  - params via `Depends` + `Query`: `severity:list[str]=Query(None)`, `status:list[str]=Query(None)`, `device_id`, `assigned_to`, `q`, `from_=Query(None, alias="from")` (alias bc `from` is py keyword), `to`, `sort`, `page=Query(1, ge=1)`, `page_size=Query(10, ge=1, le=100)`.
  - build query incrementally: `scoped(select(Alert), Alert, user)` then conditional `.where(...)`.
  - search: `Alert.title.ilike(like) | Alert.device_id.ilike(like)`.
  - `total` via `select(func.count()).select_from(stmt.subquery())`.
  - sort + `.limit(page_size).offset((page-1)*page_size)`.
  - `counts_by_status`: separate `group_by(Alert.status)` over WHOLE company set (not filtered) — for summary bar.
  - returns `{data, counts_by_status, page, page_size, total}`.
- `GET /alerts/stats` (`:99`): in-Python aggregation → MTTR (`mttrMinutes`), `openBySeverity`, `resolvedThisWeek/LastWeek`, `dismissalRate`, `resolutionBySeverity`, `volumeTrend`. note `volume` uses `defaultdict`.
  - **ROUTE ORDER GOTCHA** (`:97-98`): `/stats` and `/bulk/*` MUST be declared before `/{alert_id}` or "stats" gets parsed as an int id. Be ready to explain this.
- `_bulk_apply(db, user, ids, mutate)` (`:140`): per-id try/except, captures 409/404 per id, never aborts batch. returns `{results:[{id, ok, status|error}]}`.
- `POST /bulk/acknowledge` (`:157`), `POST /bulk/assign` (`:167`): pass a `mutate` closure to `_bulk_apply`.
- `GET /{alert_id}` (`:182`): `serialize_alert(..., with_timeline=True)`.
- `POST /{alert_id}/acknowledge` (`:187`): `enforce("acknowledge")` → set `acknowledged_at` → `_log` → commit.
- `POST /{alert_id}/assign` (`:197`): block if TERMINAL; validate assignee same company (422); set `assigned_to`; log. does NOT change status.
- `POST /{alert_id}/resolve` (`:211`): `enforce("resolve")` → set all resolution_* fields → log.
- `POST /{alert_id}/notes` (`:226`): `_log(note=...)` only, no status change.
- `POST /{alert_id}/dismiss` (`:235`, bonus) + `POST /{alert_id}/reopen` (`:244`, bonus): reopen clears resolution fields (honest record).
- principles: **incremental query building**, **separate count query for filter-independent summary**, **partial-success bulk**, **server-enforced transitions**, **DI everywhere**.

### 1.13 `api/app/routers/devices.py` — devices + readings + stats (timezone hot zone)
7
- `_get_device` company check.
- `GET /devices`, `GET /devices/{id}`.
- `GET /devices/{id}/readings` (`:38`): required `start`/`end` in **device local** → `local_to_utc` → query UTC range → serialize back to local ISO. response `{deviceId, timezone, data}`.
- `GET /devices/{id}/stats` (`:63`): daily aggregates bucketed by `utc_to_local_date` (local calendar day). excludes `NON_NUMERIC_INPUTS={motor_status}`. per day per input: avg/min/max/count.

### 1.14 `api/app/routers/users.py`

- `GET /users` → `scoped(select(User), User, user)` ordered by name → `{data:[{id,name,role,company}]}`.

### 1.15 Tests — `api/conftest.py` + `api/tests/test_api.py`

- `conftest.py`: set `DB_URL` to temp file BEFORE app import → isolated test DB; add `api/` to `sys.path`.
- `client` fixture: `TestClient(app)` as context manager → fires startup → seeds+ingests.
- `test_resolve_requires_acknowledge_first`: new→resolve = 409; acknowledge→resolve = 200. proves state machine.
- `test_company_scoping`: Brookfield alert visible to Alice, not Carol; cross-company detail = 404.
- principle: **one meaningful integration test per critical invariant**.

---

## PART 2 — FastAPI PRINCIPLES CHECKLIST (drill these as standalone Q&A)

- [ ] What is `APIRouter` and why split routers? (modular, prefix+tags, `include_router`).
- [ ] `Depends()` — what is dependency injection, how does `get_db`/`current_user` use it.
- [ ] chained deps: `current_user` depends on `bearer` + `get_db`.
- [ ] `Query(default, ge=, le=, alias=)` — query param declaration + validation + aliasing (`from`).
- [ ] path params typed (`alert_id: int`) → auto-parse + 422 on bad type.
- [ ] request body = Pydantic model param → auto-validated, auto-422.
- [ ] `HTTPBearer` from `fastapi.security`, `auto_error=False` pattern.
- [ ] `HTTPException(status, detail)` — how 401/404/409/422 are raised.
- [ ] custom `@app.exception_handler` → uniform error envelope.
- [ ] `@app.on_event("startup")` lifecycle hook (note: deprecated in favor of lifespan; know both exist).
- [ ] `CORSMiddleware` — why a browser needs it.
- [ ] Pydantic `BaseModel`, `Field`, `Literal`, `Optional` — declarative validation.
- [ ] difference: Pydantic schema (in/out shape) vs SQLAlchemy model (DB table).
- [ ] `response` is just a dict/Pydantic → auto-JSON. (here: manual serializers return dicts).
- [ ] `TestClient` for integration tests, context-manager form fires startup.
- [ ] sync `def` routes + threadpool (no `async` here) — know they chose sync because SQLAlchemy session is sync.

### SQLAlchemy sub-checklist

- [ ] `create_engine`, `sessionmaker`, `declarative_base`.
- [ ] `Column`, `ForeignKey`, `relationship`, `UniqueConstraint`, `Index`.
- [ ] 2.0 style: `select(Model)`, `db.scalars(stmt).all()`, `db.scalar(...)`, `db.get(Model, pk)`, `db.execute(...).all()`.
- [ ] `.where()`, `.in_()`, `.ilike()`, `|` (OR), `.order_by()`, `.limit()`, `.offset()`, `func.count()`, `group_by`, `case()`.
- [ ] `on_conflict_do_nothing()` dialect insert for dedup.
- [ ] `commit()`, `expire_on_commit=False` implications.

---

## PART 3 — FRONTEND, FILE BY FILE

### 3.1 `web/package.json` — deps

- next 14.2, react 18.3, @reduxjs/toolkit 2.3 (RTK + RTK Query), react-redux, @mui/material 5.16 + icons + emotion, formik 2.4 + yup 1.4, dayjs, echarts + echarts-for-react, vitest.

### 3.2 App Router shell

- `web/src/app/layout.tsx`: root server layout; `metadata`; wraps `<Providers>` → `<AppChrome>`.
- `web/src/app/providers.tsx`: `"use client"` boundary; nests `AppRouterCacheProvider` (MUI/emotion SSR) → Redux `<Provider store>` → `ColorModeProvider` → `ToastProvider`. **the "use client" provider tree — know the order**.
- `web/src/app/page.tsx`: redirects `/` → `/alerts`.

### 3.3 `web/src/components/AppChrome.tsx`

- `"use client"`. AppBar + nav tabs (Queue/Analytics) with active via `usePathname`. `UserSwitcher`. dark/light toggle via `useColorMode`. Container max-width.

### 3.4 Screen 1 — Alert Queue: `web/src/app/alerts/page.tsx`

- `"use client"`.
- server data: `useListAlertsQuery(filters)`, `useListDevicesQuery()`, `useBulkAcknowledgeMutation()`.
- client state: `filters` from `useAppSelector`, local `selectedIds`/`assignTarget`/`bulkAssignOpen` via `useState`.
- handlers: `handlePage` (resets selection), `handleBulkAcknowledge`.
- renders: `SummaryBar`, `FilterBar`, `AlertTable`, bulk action bar, `AssignDialog`.
- states to find in code: loading skeleton, empty, error.

### 3.5 Screen 2 — Alert Detail: `web/src/app/alerts/[id]/page.tsx`

- dynamic route `[id]`; `useParams`; `useGetAlertQuery(id)`; `useAlertActions()`.
- contextual buttons by status (new→Ack/Assign; acknowledged→Resolve/Assign; terminal→Reopen).
- left: `MetricCard`, assignment section, resolution details. right: `Timeline` + `AddNoteForm`. dialogs: `ResolveDialog`, `AssignDialog`.

### 3.6 Screen 5 — Analytics: `web/src/app/analytics/page.tsx`

- `useGetStatsQuery()`; `useTheme()` for chart colors.
- ECharts via `echarts-for-react`: status donut, resolution-time-by-severity bar (SLA `markLine`), volume trend stacked area. stat cards: MTTR, open by severity, resolved this week + trend, dismissal rate.

### 3.7 Types — `web/src/features/alerts/types/index.ts`

- THE frontend contract. Know: `Alert`, `AlertStatus`, `Severity`, `ResolutionType`, `UserBrief`, `TimelineEntry`, `Resolution`, `AlertListResponse`, `CountsByStatus`, `Device`, `TeamUser`, `AlertFilters`, `Stats`, `VolumePoint`, payload types (`AssignPayload`/`ResolvePayload`/`NotePayload`/`BulkAssignPayload`).
- principle: **TS interfaces mirror backend serializers** (camelCase). strict, no `any`.

### 3.8 RTK Query API — `web/src/features/alerts/api/knaqApi.ts` (CENTRAL — know cold)

- `createApi({reducerPath:"knaqApi", baseQuery, tagTypes:["Alert","Device","User"], endpoints})`.
- `baseQuery = fetchBaseQuery({baseUrl: NEXT_PUBLIC_API_BASE_URL ?? localhost:8000, prepareHeaders})`.
  - `prepareHeaders`: token = `getState().session.token || ENV_TOKEN` → `Authorization: Bearer`.
- `buildAlertQuery(filters)`: builds `URLSearchParams` (repeat `severity`/`status`, `device_id`, `assigned_to`, `q`, `sort`, `page`, `page_size`).
- queries: `listAlerts` (providesTags Alert), `getStats` (Alert), `getAlert` (`{type:Alert, id}`), `listDevices`, `listUsers`.
- mutations: `acknowledge` (**optimistic** via `onQueryStarted` + `updateQueryData` + `patch.undo()` on error), `dismiss`/`reopen`/`assign`/`resolve`/`addNote` (pessimistic), `bulkAcknowledge`/`bulkAssign`.
- `invalidatesTags` → triggers refetch of queue + that alert + stats.
- exported hooks list (`useListAlertsQuery` ... `useBulkAssignMutation`).
- principles: **server state lives in RTK Query cache**, **tag-based invalidation**, **optimistic update with rollback**, **token injection in one place**.

### 3.9 Client state — `web/src/features/alerts/slices/filtersSlice.ts`

- `createSlice`: `FiltersState` (severity[], status[], deviceId, assignedTo, q, sort, page).
- reducers: `toggleSeverity`, `toggleStatus`, `setStatusOnly`, `setDevice`, `setAssignee`, `setQuery`, `setSort` (resets page), `setPage`, `clearFilters`.
- principle: **client-only UI state separate from server state**; almost every change **resets page to 1**.

### 3.10 Session — `web/src/features/session/` (NEW, uncommitted — explore fully)

- `sessionSlice.ts`: `{token}` state; `setToken` reducer; `initialState` from `resolveInitialToken()`.
- `users.ts`: `DEMO_USERS` (6, 3 companies); `ENV_TOKEN`; `TOKEN_STORAGE_KEY="knaq.activeToken"`; `userForToken`, `resolveInitialToken` (localStorage → env).
- `UserSwitcher.tsx`: `"use client"`; menu grouped by company; on choose → save localStorage + `setToken` + `knaqApi.util.resetApiState()` (drop cache) + `clearFilters()` (no cross-tenant leak). hydration: render ENV_TOKEN default until mounted.
- principle: **switching tenant must reset cache + filters** or you leak another company's data.

### 3.11 Components — `web/src/features/alerts/components/`

- `AlertTable.tsx`: table, select-all + per-row checkbox, columns (Severity/Alert/Device/Triggered/Status/Assignee/Actions), row actions (Acknowledge if new, Assign if not terminal, View). uses `useAlertActions`.
- `FilterBar.tsx`: severity chips, status chips, search field, device dropdown, assignee dropdown, sort dropdown, clear. dispatches filter actions.
- `SummaryBar.tsx`: 4 clickable count cards → filter by status.
- `ResolveDialog.tsx`: **Formik + Yup** form (resolution_type/root_cause/action_taken required; preventive/time optional). submit → `useResolveMutation`.
- `AssignDialog.tsx`: user list w/ initials, search, optional note; single OR bulk (`bulkIds`); `useAssignMutation`/`useBulkAssignMutation`.
- `AddNoteForm.tsx`: textarea → `useAddNoteMutation`.
- `Timeline.tsx`: icon map per action; vertical timeline; UTC + relative time; note italics.
- `MetricCard.tsx`: reading vs threshold; over→error color; handles "no metric" alerts.
- `AssigneeCell.tsx`: `initials(name)` avatar or "Unassigned".
- `SeverityChip.tsx` / `StatusBadge.tsx`: colored badges from theme maps.
- `RelativeTime.tsx`: dayjs relative + tooltip with device-local exact time.

### 3.12 lib

- `lib/store/index.ts`: `configureStore({reducer:{knaqApi, filters, session}, middleware:+knaqApi.middleware})`; `RootState`/`AppDispatch` types.
- `lib/store/hooks.ts`: typed `useAppDispatch`/`useAppSelector` via `.withTypes`.
- `lib/theme/theme.ts`: `STATUS_COLORS`, `SEVERITY_COLORS`, `buildTheme(mode)` (primary `#EFC01A`, secondary `#4B8189`, borderRadius 10).
- `lib/theme/ColorModeProvider.tsx`: `"use client"`; `ColorModeContext {mode, toggle}`; localStorage `knaq-color-mode`; prefers-color-scheme fallback; wraps `ThemeProvider`+`CssBaseline`.
- `lib/toast/ToastProvider.tsx`: `ToastContext {showSuccess, showError}`; MUI `Snackbar`+`Alert`.
- `lib/apiError.ts`: `apiErrorMessage(err)` → maps FETCH_ERROR/401/409 to friendly text; `isFetchBaseQueryError` type guard.
- `lib/dayjs.ts`: dayjs + utc + timezone + relativeTime plugins.

### 3.13 Frontend test — `web/src/features/alerts/__tests__/filtersSlice.test.ts`

- vitest; reducer unit tests (toggle, page reset, sort reset, clear). principle: **test pure reducers directly**.

---

## PART 4 — REACT / NEXT / REDUX / RTK PRINCIPLES CHECKLIST

### React

- [ ] components are functions returning JSX.
- [ ] props vs state. `useState`, `useEffect` (deps array, mount-only), `useMemo`.
- [ ] custom hooks (`useAlertActions`, `useToast`, `useColorMode`, `useAppSelector`).
- [ ] Context API (`ColorModeContext`, `ToastContext`) vs Redux — when each.
- [ ] controlled inputs (Formik fields).
- [ ] keys in lists; conditional rendering for loading/empty/error.

### Next.js 14 App Router

- [ ] `app/` routing, folder = route, `[id]` = dynamic segment.
- [ ] `layout.tsx` vs `page.tsx`.
- [ ] **Server vs Client Components**: default server; `"use client"` opts in. why `Providers` is the client boundary.
- [ ] `useParams`, `usePathname`, redirect.
- [ ] `NEXT_PUBLIC_` env prefix = exposed to browser; why.

### Redux Toolkit

- [ ] `configureStore`, reducer map, middleware chain.
- [ ] `createSlice` → auto action creators + immer (mutate draft safely).
- [ ] typed hooks with `.withTypes`. `RootState`/`AppDispatch`.

### RTK Query

- [ ] `createApi`, `fetchBaseQuery`, `prepareHeaders`.
- [ ] `build.query` vs `build.mutation`; auto-generated hooks.
- [ ] cache lifecycle: `tagTypes` / `providesTags` / `invalidatesTags`.
- [ ] **optimistic update**: `onQueryStarted` + `util.updateQueryData` + `patch.undo()`.
- [ ] `util.resetApiState()` (user switch).
- [ ] query key = serialized arg (filters) → refetch on change.

### MUI / Formik / ECharts

- [ ] `createTheme`, palette, dark/light, `CssBaseline`, `ThemeProvider`.
- [ ] common components: AppBar, Table, Dialog, Chip, Snackbar, Avatar, Tabs.
- [ ] Formik `useFormik`/`<Formik>`, `validationSchema` (Yup), `touched`/`errors`, submit-disabled-until-valid.
- [ ] Yup: `string().required()`, `oneOf`, `number().min(0)`.
- [ ] ECharts option object; `echarts-for-react`; `markLine` for SLA.

---

## PART 5 — CROSS-CUTTING CONCEPTS (the "why" questions)

### 5.1 Multi-tenancy / company scoping

- backend: `scoped()` on every list; `_get_alert`/`_get_device` 404 cross-company.
- frontend: switching user resets cache + filters.
- be ready: "what stops Alice seeing Hines data?" → token→user→company filter, denormalized `Alert.company`.

### 5.2 Status state machine

- single truth: `transitions.py`. UI mirrors it (contextual buttons) but cannot bypass it. invalid → 409.
- required path: new → acknowledged → resolved. bonus: dismiss/reopen.

### 5.3 Timezone correctness

- store naive UTC. ingest from epoch ms. readings query/return in device-local. stats bucket on local day. alerts/events in UTC `Z`. frontend `RelativeTime` shows relative + device-local tooltip.

### 5.4 Dedup + malformed handling

- readings: unique `(device_id, ts_utc, input_name, input_value)` + `on_conflict_do_nothing`.
- alerts: unique `(device_id, ts_utc, alert_type)`.
- malformed → `RejectedMessage`, never crash.

### 5.5 Threshold breach + anomaly

- breach = crosses `alert_thresholds` (`_breach`), flagged on reading, stored not discarded.
- anomaly = in-range but z-score > 2.5σ (`flag_anomalies`).

### 5.6 Optimistic vs pessimistic UI

- acknowledge = optimistic (instant + rollback). all others = pessimistic (await server, then invalidate). know why acknowledge specifically: cheap, single-field, high-frequency.

### 5.7 Error handling end-to-end

- backend uniform envelope `{error:{code,message}}`. frontend `apiErrorMessage` maps to toast. 401/404/409 each have meaning.

---

## PART 6 — RAPID-FIRE "WHERE IS THE CODE FOR…" (self-quiz)

- token validation → `api/app/auth.py:11 current_user`.
- company filter → `api/app/auth.py:23 scoped`.
- status transition rules → `api/app/transitions.py` (`enforce`).
- alert list + filters + pagination → `routers/alerts.py:46`.
- summary-bar counts → `routers/alerts.py:84-88` (separate group_by).
- stats/MTTR → `routers/alerts.py:99`.
- resolve writes resolution fields → `routers/alerts.py:211`.
- bulk partial success → `routers/alerts.py:140 _bulk_apply`.
- readings timezone conversion → `routers/devices.py:38` + `tz.py local_to_utc/utc_to_local_iso`.
- daily stats local-day bucketing → `routers/devices.py:63` + `tz.utc_to_local_date`.
- dedup constraints → `models.py` UniqueConstraints; insert in `ingest.py`.
- malformed message logging → `ingest.py` → `RejectedMessage`.
- anomaly detection → `ingest.py flag_anomalies`.
- seed users/tokens → `seed.py USERS`.
- startup/seed/ingest → `main.py:30`.
- CORS → `main.py:22`.
- error envelope → `main.py` exception handlers.
- bearer token injection (FE) → `knaqApi.ts:23 prepareHeaders`.
- optimistic acknowledge → `knaqApi.ts:74 onQueryStarted`.
- cache invalidation → `knaqApi.ts invalidatesTags`.
- filter state → `filtersSlice.ts`.
- user switching / tenant reset → `session/UserSwitcher.tsx` + `sessionSlice.ts`.
- alert queue screen → `app/alerts/page.tsx`.
- alert detail screen → `app/alerts/[id]/page.tsx`.
- resolve form + validation → `components/ResolveDialog.tsx` (Formik/Yup).
- assign dialog (single+bulk) → `components/AssignDialog.tsx`.
- timeline render → `components/Timeline.tsx`.
- metric vs threshold card → `components/MetricCard.tsx`.
- theme/colors/dark mode → `lib/theme/theme.ts` + `ColorModeProvider.tsx`.
- relative time → `components/RelativeTime.tsx` + `lib/dayjs.ts`.
- store config → `lib/store/index.ts`.
- analytics charts → `app/analytics/page.tsx`.

---

## PART 7 — SYNTAX DRILLS (be able to read aloud + explain each token)

Backend:

1. `def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:` — DI, type hints, security scheme.
2. `severity: list[str] | None = Query(None)` — repeatable query param.
3. `from_: str | None = Query(None, alias="from")` — alias for reserved word.
4. `page_size: int = Query(10, ge=1, le=100)` — bounded validation.
5. `stmt = scoped(select(Alert), Alert, user).where(Alert.severity.in_(severity))` — 2.0 select + scoping.
6. `db.scalars(stmt.limit(n).offset(m)).all()` — execute + fetch.
7. `case((Alert.severity=="critical",0), else_=2)` — SQL CASE in Python.
8. `raise HTTPException(409, "...")` — typed error.
9. `alert.events.append(AlertEvent(...))` then `db.commit()` — relationship write.
10. `class ResolveBody(BaseModel): root_cause: str = Field(min_length=1)` — Pydantic constraint.
11. `ResolutionType = Literal["fixed", ...]` — enum-by-literal.
12. `insert(Reading).on_conflict_do_nothing(...)` — dedup insert.

Frontend:

1. `"use client"` — top-of-file client boundary.
2. `const { data, isLoading, error } = useListAlertsQuery(filters)` — RTK query hook return.
3. `const [open, setOpen] = useState(false)` — state hook.
4. `dispatch(toggleSeverity("critical"))` — slice action.
5. `prepareHeaders: (h, {getState}) => { h.set("Authorization", \`Bearer ${token}\`) }` — token inject.
6. `providesTags: ["Alert"]` / `invalidatesTags: (_r,_e,id)=>["Alert",{type:"Alert",id}]` — cache graph.
7. `onQueryStarted(id,{dispatch,queryFulfilled}){ const patch=dispatch(util.updateQueryData(...)); try{await queryFulfilled}catch{patch.undo()} }` — optimistic+rollback.
8. `createSlice({name, initialState, reducers:{...}})` — immer draft mutation.
9. `useFormik({initialValues, validationSchema, onSubmit})` — form wiring.
10. `Yup.string().required()` / `Yup.number().min(0)` — validation rules.
11. `<ReactECharts option={option} />` — chart render.
12. `useAppSelector((s)=>s.filters)` — typed selector.

---

### How to use this doc

Go file by file (Part 1, then Part 3). For each, open the real file beside this list. After backend + frontend, do Part 2 + Part 4 as flashcards. Then Part 5 (why), then self-test with Part 6, then read-aloud Part 7. If you can answer Part 6 without opening files, you're ready.
