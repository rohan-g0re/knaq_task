# Knaq — IoT Alert Triage & Resolution

A full-stack alert triage system. A **FastAPI** backend ingests the raw device messages in
`data/sensor_messages.json`, validates / de-dupes / flags them, and exposes a timezone-aware,
multi-tenant REST API; a **Next.js 14** frontend lets a building manager acknowledge, assign,
resolve, dismiss, and audit those alerts — reading and writing live, no mock data.

```
api/    FastAPI + SQLAlchemy 2.0 + SQLite        (Python)
web/    Next.js 14 App Router + MUI v5 + Redux Toolkit / RTK Query + Formik/Yup  (TypeScript, strict)
data/   devices.json + sensor_messages.json      (provided)
```

This README covers **how to run it**. For the design decisions, a feature-by-feature walkthrough of
everything I built (mandatory + bonus), trade-offs, and the AI-tool disclosure, see
**[SOLUTION.md](./SOLUTION.md)**.

---

## Prerequisites

- **Python 3.11+** (developed on 3.12)
- **Node.js 18.18+** (developed on 20)

SQLite is file-based, so there's no separate database to install or run. (Docker is optional — see
below.)

---

## 1. Run the backend (`api/`)

```bash
cd api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # the defaults work as-is

uvicorn app.main:app --reload --port 8000
```

On the **first** start (empty DB) the app seeds the users + devices and ingests every message
automatically — there's no separate seed/migrate step. It logs the counts so you can sanity-check the
ingest:

```
ingest done: {'readings': 1712, 'alerts': 25, 'recoveries': 15, 'duplicates': 11, 'rejected': 7, 'anomalies': 4}
```

To force a clean re-ingest, delete the SQLite file and restart: `rm api/knaq.db`.
Interactive API docs (Swagger) are at **http://localhost:8000/docs**.

### Backend environment (`api/.env`)

| Var          | Default                 | Meaning                                 |
| ------------ | ----------------------- | --------------------------------------- |
| `DATA_DIR`   | `../data`               | Where the provided JSON lives           |
| `DB_URL`     | `sqlite:///./knaq.db`   | SQLAlchemy URL (swap for Postgres etc.) |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS origin for the frontend            |

---

## 2. Run the frontend (`web/`)

```bash
cd web
npm install
cp .env.example .env.local         # points at localhost:8000 as Alice (Brookfield)
npm run dev                        # http://localhost:3000  ->  redirects to /alerts
```

### Frontend environment (`web/.env.local`)

| Var                        | Default                  | Meaning                              |
| -------------------------- | ------------------------ | ------------------------------------ |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000`  | Backend base URL                     |
| `NEXT_PUBLIC_API_TOKEN`    | `brookfield-alice-token` | Bearer token of the "logged-in" user |

---

## 3. Run with Docker (optional, one command)

From a fresh clone, with Docker running:

```bash
docker compose up --build          # api -> :8000, web -> :3000
```

Two services only — `api` and `web`. Storage is SQLite on a **named volume** (no separate db
service): on first boot the API seeds users/devices and ingests the messages automatically, exactly
like the local flow. The provided `./data` is mounted read-only. The `NEXT_PUBLIC_*` values are baked
into the web image at build time (the browser reaches the API at the host-published
`localhost:8000`); override them via `web.build.args` in `docker-compose.yml`. The seeded tokens
below apply identically.

---

## Seeded users / tokens (for testing)

Auth is a bearer-token → user lookup; every request needs `Authorization: Bearer <token>`. The
frontend is wired as **Alice Chen** because Brookfield has the most alerts (the liveliest demo).

| Token                    | User         | Role               | Company               |
| ------------------------ | ------------ | ------------------ | --------------------- |
| `brookfield-alice-token` | Alice Chen   | Facilities Manager | Brookfield Properties |
| `brookfield-bob-token`   | Bob Martinez | Field Technician   | Brookfield Properties |
| `hines-carol-token`      | Carol Davis  | Facilities Manager | Hines                 |
| `hines-dan-token`        | Dan Wright   | Field Technician   | Hines                 |
| `mitsui-emi-token`       | Emi Tanaka   | Facilities Manager | Mitsui Fudosan        |
| `mitsui-frank-token`     | Frank Liu    | Field Technician   | Mitsui Fudosan        |

Swap `NEXT_PUBLIC_API_TOKEN` (or the curl token) to watch multi-tenancy work — a Hines user never
sees a Brookfield alert, and a cross-company detail request returns `404`.

---

## Quick API tour (verify it works across the wire)

```bash
TOKEN=brookfield-alice-token
curl -H "Authorization: Bearer $TOKEN" localhost:8000/alerts
curl -H "Authorization: Bearer $TOKEN" localhost:8000/alerts/2
curl -X POST -H "Authorization: Bearer $TOKEN" localhost:8000/alerts/2/acknowledge

# Timezone-aware readings — params AND response timestamps are in the device's local tz:
curl -H "Authorization: Bearer mitsui-emi-token" \
  "localhost:8000/devices/ESC-001/readings?start=2026-02-10T00:00:00&end=2026-02-13T00:00:00"

# Error semantics:
curl -X POST -H "Authorization: Bearer $TOKEN" localhost:8000/alerts/2/resolve  # 409 (not acknowledged)
curl -H "Authorization: Bearer nope" localhost:8000/alerts                       # 401 (bad token)
```

---

## Endpoint reference

| Method | Path                       | Notes                                                                                                                                     |
| ------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/alerts`                  | Filters `severity`, `status[]`, `device_id`, `assigned_to`, `q`, `from`, `to`; `sort`, `page`, `page_size` (server-side, 10/page). Returns `{ data, counts_by_status, page, page_size, total }`. |
| GET    | `/alerts/:id`              | Full alert + `timeline`.                                                                                                                  |
| POST   | `/alerts/:id/acknowledge`  | `new → acknowledged`.                                                                                                                     |
| POST   | `/alerts/:id/assign`       | `{ assignee_id, note? }` — allowed in any non-terminal status, doesn't change `status`.                                                  |
| POST   | `/alerts/:id/resolve`      | `{ resolution_type, root_cause, action_taken, preventive_measures?, time_spent_minutes? }`; `acknowledged → resolved`.                    |
| POST   | `/alerts/:id/notes`        | `{ note }` — appends to the timeline without changing status.                                                                            |
| POST   | `/alerts/:id/dismiss`      | **Bonus.** `new\|acknowledged → dismissed`.                                                                                              |
| POST   | `/alerts/:id/reopen`       | **Bonus.** `resolved\|dismissed → acknowledged` (clears the stale resolution).                                                           |
| POST   | `/alerts/bulk/acknowledge` | **Bonus.** Per-id outcomes in one response.                                                                                              |
| POST   | `/alerts/bulk/assign`      | **Bonus.** Per-id outcomes in one response.                                                                                              |
| GET    | `/alerts/stats`            | **Bonus.** Aggregates for the analytics dashboard.                                                                                       |
| GET    | `/devices`, `/devices/:id` | Company-scoped device registry / detail.                                                                                                  |
| GET    | `/devices/:id/readings`    | **Required** `start`/`end`, interpreted and returned in **device-local** time.                                                            |
| GET    | `/devices/:id/stats`       | **Bonus.** avg/min/max/count per numeric reading type, per device-local day.                                                              |
| GET    | `/users`                   | Team members for assignment (company-scoped).                                                                                            |

All read endpoints are scoped to the requesting token's company.

---

## Tests

```bash
# API — pytest + FastAPI TestClient against a temp, freshly-seeded SQLite DB
cd api
pip install -r requirements-dev.txt
pytest -q          # 2 passed: transition-409 path, and company-scoping (list excludes + detail 404)

# Frontend — Vitest, lightweight and Vite-native
cd web
npm install
npm run test       # 5 passed: filtersSlice reducer, incl. the page-reset-on-filter/sort invariant
```

---

For the design reasoning, the full feature-by-feature walkthrough (mandatory + bonus), trade-offs,
and AI-tool disclosure, see **[SOLUTION.md](./SOLUTION.md)**.
