# Knaq — IoT Alert Triage & Resolution

A full-stack alert triage system. A FastAPI backend ingests raw device messages
(`data/sensor_messages.json`), validates/dedups/flags them, and exposes a timezone-aware,
multi-tenant REST API. A Next.js frontend lets a building manager acknowledge, assign,
resolve, and audit those alerts.

```
api/    FastAPI + SQLAlchemy + SQLite   (Python)
web/    Next.js 14 App Router + MUI + Redux Toolkit/RTK Query + Formik  (TypeScript)
data/   devices.json + sensor_messages.json (provided)
```

See **[SOLUTION.md](./SOLUTION.md)** for design decisions, trade-offs, and AI tool disclosure.

---

## Prerequisites

- Python 3.11+ (developed on 3.12)
- Node.js 18.18+ (developed on 20 / 24)

---

## 1. Backend (`api/`)

```bash
cd api
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # defaults work as-is

uvicorn app.main:app --reload --port 8000
```

On first start (empty DB) the app **seeds users + devices and ingests the messages
automatically** — no separate seed step. It logs counts:

```
ingest done: {'readings': 1712, 'alerts': 25, 'recoveries': 15, 'duplicates': 11, 'rejected': 7}
```

To force a fresh re-ingest, delete the SQLite file and restart: `rm api/knaq.db`.

API docs (Swagger): http://localhost:8000/docs

### Environment (`api/.env`)

| Var          | Default                  | Meaning                              |
| ------------ | ------------------------ | ------------------------------------ |
| `DATA_DIR`   | `../data`                | Where the provided JSON lives        |
| `DB_URL`     | `sqlite:///./knaq.db`    | SQLAlchemy URL                       |
| `WEB_ORIGIN` | `http://localhost:3000`  | CORS origin for the frontend         |

---

## 2. Frontend (`web/`)

```bash
cd web
npm install
cp .env.example .env.local       # points at http://localhost:8000 with Alice's token
npm run dev                      # http://localhost:3000  ->  redirects to /alerts
```

### Environment (`web/.env.local`)

| Var                        | Default                  | Meaning                          |
| -------------------------- | ------------------------ | -------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000`  | Backend base URL                 |
| `NEXT_PUBLIC_API_TOKEN`    | `brookfield-alice-token` | Bearer token of the logged-in user |

---

## Seeded users / tokens (for testing)

Auth is a bearer-token → user lookup. All requests need `Authorization: Bearer <token>`.
The frontend is wired as **Alice Chen** (Brookfield has the most alerts → liveliest demo).

| Token                    | User          | Role               | Company              |
| ------------------------ | ------------- | ------------------ | -------------------- |
| `brookfield-alice-token` | Alice Chen    | Facilities Manager | Brookfield Properties|
| `brookfield-bob-token`   | Bob Martinez  | Field Technician   | Brookfield Properties|
| `hines-carol-token`      | Carol Davis   | Facilities Manager | Hines                |
| `hines-dan-token`        | Dan Wright    | Field Technician   | Hines                |
| `mitsui-emi-token`       | Emi Tanaka    | Facilities Manager | Mitsui Fudosan       |
| `mitsui-frank-token`     | Frank Liu     | Field Technician   | Mitsui Fudosan       |

Swap `NEXT_PUBLIC_API_TOKEN` (or the curl token) to see company-scoping in action — Hines
users never see Brookfield alerts, and cross-company detail requests return `404`.

---

## Quick API tour

```bash
TOKEN=brookfield-alice-token
curl -H "Authorization: Bearer $TOKEN" localhost:8000/alerts
curl -H "Authorization: Bearer $TOKEN" localhost:8000/alerts/2
curl -X POST -H "Authorization: Bearer $TOKEN" localhost:8000/alerts/2/acknowledge

# Timezone-aware readings (params + response in the device's local tz):
curl -H "Authorization: Bearer mitsui-emi-token" \
  "localhost:8000/devices/ESC-001/readings?start=2026-02-10T00:00:00&end=2026-02-13T00:00:00"

# Invalid transition -> 409; bad token -> 401
curl -X POST -H "Authorization: Bearer $TOKEN" localhost:8000/alerts/2/resolve  # 409 (not acknowledged)
curl -H "Authorization: Bearer nope" localhost:8000/alerts                       # 401
```

---

## Endpoints

| Method | Path                         | Notes                                                     |
| ------ | ---------------------------- | --------------------------------------------------------- |
| GET    | `/alerts`                    | filters: `severity`, `status`, `device_id`, `assigned_to`, `q`, `from`, `to`; returns `{ data, counts_by_status }` |
| GET    | `/alerts/:id`                | full alert + `timeline`                                   |
| POST   | `/alerts/:id/acknowledge`    | `new → acknowledged`                                      |
| POST   | `/alerts/:id/assign`         | `{ assignee_id, note? }`                                  |
| POST   | `/alerts/:id/resolve`        | `{ resolution_type, root_cause, action_taken, ... }`, `acknowledged → resolved` |
| POST   | `/alerts/:id/notes`          | `{ note }`                                                |
| GET    | `/devices`, `/devices/:id`   | company-scoped                                            |
| GET    | `/devices/:id/readings`      | **required** `start`/`end` (device-local tz)              |
| GET    | `/users`                     | team members for assignment                               |

All read endpoints are scoped to the requesting token's company.
